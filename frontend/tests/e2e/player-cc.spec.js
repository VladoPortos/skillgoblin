import { test, expect } from '@playwright/test';

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

// Pull the course list and find a course whose first video has NO `subtitle`
// field. Returns the course id. Throws if every fixture course has subtitles
// (in which case this test would be vacuous and a fixture without an .srt
// sibling needs to be added).
async function findCourseWithoutSubtitle(request) {
  const r = await request.get('/api/courses?limit=20');
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(Array.isArray(body.items) && body.items.length > 0).toBe(true);
  for (const item of body.items) {
    const detail = await request.get(`/api/courses/${item.id}`);
    const course = await detail.json();
    const firstVideo = course?.lessons?.[0]?.videos?.[0];
    if (firstVideo && !firstVideo.subtitle) {
      return course.id;
    }
  }
  throw new Error('No fixture course has a video without a subtitle sidecar.');
}

async function openCourseDetail(page, courseId) {
  await page.goto(`/courses/${encodeURIComponent(courseId)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid=player-speed]', { timeout: 5_000 });
}

test.describe('player CC toggle', () => {
  test.beforeAll(async ({ request }) => {
    await loginAdmin(request);
    await rescanAndWait(request);
  });

  test('CC button is hidden when the selected video has no subtitle sidecar', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    const courseId = await findCourseWithoutSubtitle(request);
    await openCourseDetail(page, courseId);
    await expect(page.locator('[data-testid=player-cc-toggle]')).toHaveCount(0);
  });
});
