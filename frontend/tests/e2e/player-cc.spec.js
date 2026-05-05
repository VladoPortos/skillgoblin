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

async function openFirstCourse(page) {
  await page.goto('/courses');
  await page.waitForLoadState('networkidle');
  const firstCard = page.locator('main h3').first();
  await firstCard.click();
  await page.waitForURL(/\/courses\/[^/]+/);
  await page.waitForSelector('[data-testid=player-speed]', { timeout: 5_000 });
}

test.describe('player CC toggle', () => {
  test.beforeAll(async ({ request }) => {
    await loginAdmin(request);
    await rescanAndWait(request);
  });

  test('CC button is hidden when no subtitle sidecar exists', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await openFirstCourse(page);
    await expect(page.locator('[data-testid=player-cc-toggle]')).toHaveCount(0);
  });
});
