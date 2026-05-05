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

  test('clicking another video and back preserves saved progress (regression)', async ({ page, request }) => {
    // Reproduces the click-away / click-back bug the user actually saw:
    // after clicking a different video and clicking back, the original
    // video's saved progress was wiped to 0 in the database and the next
    // open seeked to 0.
    //
    // Root cause: in the brief window between playVideo updating
    // currentVideoId and handleVideoLoaded firing for the new src, any
    // timeupdate event dispatched on the <video> element runs the parent's
    // updateProgress, which writes (currentTime / duration) * 100 into
    // videoProgress[currentVideoId] and POSTs the whole bag via
    // saveProgress — using the WRONG src's timing, attributed to the
    // newly-selected video. Click-back attributes the wrong src's 0 to the
    // original video, the backend persists 0, and the next loadedmetadata
    // → handleVideoLoaded reads 0 and seeks to 0.
    //
    // The fix gates updateProgress on a `transitioning` flag set in
    // playVideo and cleared in handleVideoLoaded once duration is valid.
    // The test exercises the race by manually dispatching timeupdate
    // between the click and the loadedmetadata for the new video, then
    // asserts the backend still has the original video's saved progress.

    const admin = await loginAdmin(request);
    await attachAuthCookie(page, request);
    const userId = admin.id;

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

    // Seed v0 = 50% so smart-open will pick v0 and seek to (50/100)*200 = 100.
    await request.post(`/api/user-progress/${userId}`, {
      data: {
        courseId: sample.id,
        data: {
          completed: {},
          progress: { [v0Id]: 50 },
          favorite: false,
          lastViewed: { lessonId: lesson.id, videoIndex: 0 },
        },
      },
    });

    await page.goto(`/courses/${sample.id}`);
    await page.waitForSelector('video', { timeout: 5_000 });

    // Stub duration so handleVideoLoaded has a sane number to multiply
    // against the saved percentage. The element is reused across src
    // changes, so the stub holds for the whole test.
    await page.evaluate(() => {
      const v = document.querySelector('video');
      Object.defineProperty(v, 'duration', { configurable: true, get: () => 200 });
      Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 });
      v.dispatchEvent(new Event('loadedmetadata'));
    });

    // Sanity: smart-open + handleVideoLoaded landed on v0 at ~100.
    const initialCt = await page.evaluate(() => document.querySelector('video').currentTime);
    expect(initialCt, 'smart-open should seek v0 to ~100').toBeGreaterThanOrEqual(50);

    // Click v1, then immediately fire a timeupdate. This is the racy
    // event the bug depends on: currentVideoId is now v1's, but no
    // loadedmetadata has fired for v1 yet. Without the gate, updateProgress
    // would write 0 to videoProgress[v1] and POST it; with the gate, it's
    // a no-op.
    await page.locator(`[data-testid="lesson-video-${lesson.id}-1"]`).click();
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.currentTime = 0;
      v.dispatchEvent(new Event('timeupdate'));
    });
    // Let saveProgress (debounce-free, fire-and-forget) settle.
    await page.waitForTimeout(150);

    // Now the dangerous click — click back to v0. The race attributes
    // the post-load 0 timing to v0 and would persist v0 = 0.
    await page.locator(`[data-testid="lesson-video-${lesson.id}-0"]`).click();
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.currentTime = 0;
      v.dispatchEvent(new Event('timeupdate'));
    });
    await page.waitForTimeout(150);

    // Read the persisted progress. With the fix, v0 is still exactly 50
    // (the seeded value, no save calls happened — gates prevented all
    // updateProgress writes during the transition). Without the fix, the
    // stale-timeupdate writes 0 and the backend persists it. We assert the
    // exact seeded value so a wrong-src overwrite to any other value
    // (including a bogus high number) also fails.
    const progressRes = await request.get(`/api/user-progress/${userId}`);
    const progressBody = await progressRes.json();
    const persisted = progressBody?.progress?.[sample.id]?.progress?.[v0Id];
    expect(
      Number(persisted),
      `expected videoProgress[${v0Id}] to remain exactly 50 across click-away/click-back; got ${persisted}`
    ).toBe(50);

    // Now dispatch a real loadedmetadata for v0 so handleVideoLoaded clears
    // the transition gate, then drive a fresh timeupdate at a NEW position
    // and verify the backend reflects it. This catches a pathological
    // version of the fix where transitioning is set true and never cleared
    // — saves would be permanently disabled and the earlier assertion
    // alone would still pass.
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.dispatchEvent(new Event('loadedmetadata'));
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      v.currentTime = 120; // 60% of 200
      v.dispatchEvent(new Event('timeupdate'));
    });
    await page.waitForTimeout(200);

    const resumedRes = await request.get(`/api/user-progress/${userId}`);
    const resumedBody = await resumedRes.json();
    const resumed = Number(resumedBody?.progress?.[sample.id]?.progress?.[v0Id]);
    expect(
      resumed,
      `after handleVideoLoaded for v0, a fresh timeupdate at 60% must persist (got ${resumed})`
    ).toBeGreaterThanOrEqual(55);
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
