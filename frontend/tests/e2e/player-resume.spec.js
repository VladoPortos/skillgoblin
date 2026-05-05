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

  test('clicking a partially-watched video resumes from saved position', async ({ page, request }) => {
    // Regression for the click-to-resume bug: when the user clicked a video
    // in the lesson list whose saved progress mapped to the SAME numeric
    // currentTimeForPlayer value as the previously-selected video,
    // VideoPlayer's currentTime watcher (Vue value-change semantics) did not
    // fire and the freshly-loaded element stayed at 0.
    //
    // The fix resets currentTimeForPlayer to 0 inside playVideo whenever the
    // selected video changes, so handleVideoLoaded's later assignment is
    // always a value transition and the watcher always seeks.
    const admin = await loginAdmin(request);
    await attachAuthCookie(page, request);
    const userId = admin.id;

    // Find a course with at least 2 videos in the first lesson — required to
    // exercise the click-away/click-back path.
    const coursesRes = await request.get('/api/courses?limit=20');
    const coursesBody = await coursesRes.json();
    let sample = null;
    let lesson = null;
    for (const item of coursesBody.items || []) {
      const cRes = await request.get(`/api/courses/${item.id}`);
      const cData = await cRes.json();
      const l0 = cData.lessons?.[0];
      if (l0 && l0.videos && l0.videos.length >= 2) {
        sample = cData;
        lesson = l0;
        break;
      }
    }
    expect(sample, 'fixture course with 2+ videos in first lesson should exist').toBeTruthy();

    const v0Id = `${lesson.id}-0`;
    const v1Id = `${lesson.id}-1`;

    // Seed BOTH videos with the same saved-progress percentage so the buggy
    // value-equal write path is what we're actually exercising.
    await request.post(`/api/user-progress/${userId}`, {
      data: {
        courseId: sample.id,
        data: {
          completed: {},
          progress: { [v0Id]: 50, [v1Id]: 50 },
          favorite: false,
          lastViewed: { lessonId: lesson.id, videoIndex: 0 },
        },
      },
    });

    await page.goto(`/courses/${sample.id}`);
    await page.waitForSelector('video', { timeout: 5_000 });

    // Stub duration permanently on this <video> instance. The element is
    // reused across src changes (v-if="src" stays truthy), so one stub holds
    // for the whole test.
    await page.evaluate(() => {
      const v = document.querySelector('video');
      Object.defineProperty(v, 'duration', { configurable: true, get: () => 200 });
      Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 });
      try { v.currentTime = 0; } catch {}
      v.dispatchEvent(new Event('loadedmetadata'));
    });

    // Smart-open lands on v0 (first not completed) → seek to (50/100)*200 = 100.
    const initialCt = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(initialCt).toBeGreaterThanOrEqual(50);

    // Click v1. Seek target should also be 100 (same percent, same duration).
    await page.locator(`[data-testid="lesson-video-${lesson.id}-1"]`).click();
    // Reactive flush + simulated browser-side reload: load() in a real
    // Chromium resets currentTime to 0; mirror that here so we measure the
    // parent's seek pipeline rather than residual state from the previous src.
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      try { v.currentTime = 0; } catch {}
      v.dispatchEvent(new Event('loadedmetadata'));
    });
    await page.waitForTimeout(50);
    const v1Ct = await page.evaluate(() => document.querySelector('video').currentTime);
    // With the fix, the watcher fires (100 → 0 inside playVideo, then 0 → 100
    // from handleVideoLoaded) and the player seeks to ~100. Without the fix,
    // the 100 → 100 write is a no-op and currentTime stays at 0.
    expect(v1Ct, 'v1 should resume to 50% of 200 = 100').toBeGreaterThanOrEqual(50);

    // Click v0 again. Same target. Same regression surface.
    await page.locator(`[data-testid="lesson-video-${lesson.id}-0"]`).click();
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      try { v.currentTime = 0; } catch {}
      v.dispatchEvent(new Event('loadedmetadata'));
    });
    await page.waitForTimeout(50);
    const v0Ct = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(v0Ct, 'v0 should resume to 50% of 200 = 100 on click-back').toBeGreaterThanOrEqual(50);
  });

  test('parent owns the seek (regression for the loadedmetadata race bug)', async ({ page, request }) => {
    // This test verifies the architectural fix without relying on a valid
    // video file. We stub `video.duration` and dispatch `loadedmetadata`
    // manually, then assert the parent's handleVideoLoaded ran (currentTime
    // was set based on saved progress) instead of the previous bug where the
    // internal listener overwrote it to 0.
    const admin = await loginAdmin(request);
    await attachAuthCookie(page, request);
    const userId = admin.id;
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
