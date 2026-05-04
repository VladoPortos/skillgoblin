import { test, expect } from '@playwright/test';

// PR-D e2e: validates the newest-first sort and the NEW badge. The dockerized
// test stack mounts `frontend/tests/fixtures/content` at `/app/data/content`
// (see docker-compose.test.yml). A `beforeAll` triggers a rescan so the
// fixture course is in the DB before assertions.

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

test.describe('recently-added discovery', () => {
  test.beforeAll(async ({ request }) => {
    await loginAdmin(request);
    const rescan = await request.post('/api/courses/rescan', { data: { preserveMetadata: true } });
    expect(rescan.ok()).toBeTruthy();
    for (let i = 0; i < 30; i += 1) {
      const s = await request.get('/api/status/scan');
      const body = await s.json();
      if (body.complete) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Rescan did not complete in time');
  });

  test('the API returns isNew booleans on every item', async ({ request }) => {
    const r = await request.get('/api/courses?limit=20');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(typeof item.isNew).toBe('boolean');
    }
  });

  test('newly-scanned fixture course is flagged isNew', async ({ request }) => {
    const r = await request.get('/api/courses?limit=20');
    const body = await r.json();
    // The fixture was just scanned, so its created_at is "now-ish" and the
    // 7-day default window covers it.
    const anyNew = body.items.some((i) => i.isNew === true);
    expect(anyNew).toBe(true);
  });

  test('newest sort param is round-tripped through the URL', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');
    await page.selectOption('[data-testid=course-sort]', 'newest');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/sort=newest/);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid=course-sort]')).toHaveValue('newest');
  });

  test('NEW badge renders on the recently-scanned fixture card', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid=course-new-badge]').first()).toBeVisible({ timeout: 5_000 });
  });
});
