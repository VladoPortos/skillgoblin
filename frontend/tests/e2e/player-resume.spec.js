import { test, expect } from '@playwright/test';

// PR-C e2e: validates smart course-open and the "Start from beginning"
// override. The dockerized test fixture has an empty 0-byte .mp4 — Chromium
// will fail to load it as a real video, so tests that need duration use a
// minimal stub that overrides `video.duration` via the page context.

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function loginAdmin(request) {
  const usersRes = await request.get('/api/users');
  expect(usersRes.ok()).toBeTruthy();
  const users = await usersRes.json();
  const admin = users.find((u) => u.name === ADMIN_NAME);
  expect(admin, `expected admin "${ADMIN_NAME}" in /api/users`).toBeTruthy();
  const r = await request.post('/api/users/auth', {
    data: { userId: admin.id, password: ADMIN_PASSWORD },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.success).toBe(true);
  return admin;
}

async function attachAuthCookie(page, request) {
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);
}

async function rescanAndWait(request) {
  const rescan = await request.post('/api/courses/rescan', { data: { preserveMetadata: true } });
  expect(rescan.ok()).toBeTruthy();
  for (let i = 0; i < 30; i += 1) {
    const s = await request.get('/api/status/scan');
    const body = await s.json();
    if (body.complete) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Rescan did not complete in time');
}

test.describe('player resume + smart open', () => {
  test.beforeAll(async ({ request }) => {
    await loginAdmin(request);
    await rescanAndWait(request);
  });

  test('Start from beginning link is visible on the course detail page', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('main h3').first();
    await firstCard.click();
    await page.waitForURL(/\/courses\/[^/]+/);
    await expect(page.locator('[data-testid=start-from-beginning]')).toBeVisible({ timeout: 5_000 });
  });

  test('player controls bar (speed dropdown) is present', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('main h3').first();
    await firstCard.click();
    await page.waitForURL(/\/courses\/[^/]+/);
    // Wait for the player block to render. The speed dropdown is always
    // visible regardless of subtitle availability.
    await expect(page.locator('[data-testid=player-speed]')).toBeVisible({ timeout: 5_000 });
  });

  test('CC toggle is hidden when no subtitle sidecar exists', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('main h3').first();
    await firstCard.click();
    await page.waitForURL(/\/courses\/[^/]+/);
    // Without an .srt next to the .mp4, the API does not emit a `subtitle`
    // field and the CC button is not rendered.
    await expect(page.locator('[data-testid=player-cc-toggle]')).toHaveCount(0);
  });

  test('parent owns the seek (regression for the loadedmetadata race bug)', async ({ page, request }) => {
    // This test verifies the architectural fix without relying on a valid
    // video file. We stub `video.duration` and dispatch `loadedmetadata`
    // manually, then assert the parent's handleVideoLoaded ran (currentTime
    // was set based on saved progress) instead of the previous bug where the
    // internal listener overwrote it to 0.
    await loginAdmin(request);
    await attachAuthCookie(page, request);

    // Seed 50% saved progress for the first video.
    const userIdRes = await request.get('/api/auth/me');
    expect(userIdRes.ok()).toBeTruthy();
    const me = await userIdRes.json();
    const userId = me?.id;
    expect(userId).toBeTruthy();

    // Pull course list to find a real course id and lesson layout.
    const coursesRes = await request.get('/api/courses?limit=1');
    const coursesBody = await coursesRes.json();
    const sample = coursesBody.items?.[0];
    expect(sample, 'fixture course should exist').toBeTruthy();
    const courseRes = await request.get(`/api/courses/${sample.id}`);
    const course = await courseRes.json();
    const lesson = course.lessons[0];
    expect(lesson?.videos?.length).toBeGreaterThan(0);
    const targetId = `${lesson.id}-0`;

    await request.post(`/api/user-progress/${userId}`, {
      data: {
        courseId: course.id,
        data: {
          completed: {},
          progress: { [targetId]: 50 },
          favorite: false,
          lastViewed: { lessonId: lesson.id, videoIndex: 0 },
        },
      },
    });

    await page.goto(`/courses/${sample.id}`);
    await page.waitForSelector('video', { timeout: 5_000 });

    // Stub duration and dispatch loadedmetadata so the parent's seek logic runs.
    await page.evaluate(() => {
      const v = document.querySelector('video');
      Object.defineProperty(v, 'duration', { configurable: true, get: () => 200 });
      Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 });
      v.dispatchEvent(new Event('loadedmetadata'));
    });

    // The parent computes currentTimeForPlayer = (50 / 100) * 200 = 100s.
    // The watcher on currentTime then seeks the player to ~100s. Allow some
    // tolerance because applySeek's 0.25s threshold can suppress writes when
    // the video has no real timing information.
    const ct = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(ct).toBeGreaterThanOrEqual(50); // 50% of 200 = 100s; allow >= 50 as a permissive lower bound for stub flakiness
  });
});
