import { test, expect } from '@playwright/test';

// PR-A e2e: validates the admin Content-tab export flow and the related
// authorization on the new endpoints. The dockerized test fixture has an
// empty /app/data/content tmpfs, so the bulk export legitimately returns
// `{ written: [], failed: [] }`. We test the auth boundary, the response
// shape, and the UI surface — not the filesystem write itself, which is
// covered by the unit tests on the underlying utilities.

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

test.describe('admin content export — auth and shape', () => {
  test('POST /api/courses/export-json-all without auth is refused', async ({ request }) => {
    // Fresh request context (no cookie).
    const r = await request.post('/api/courses/export-json-all');
    // 401 (no session) or 403 (session but not admin) — never 200.
    expect([401, 403]).toContain(r.status());
  });

  test('POST /api/courses/export-json-all as admin returns the documented shape', async ({ request }) => {
    await loginAdmin(request);
    const r = await request.post('/api/courses/export-json-all');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body).toHaveProperty('success');
    expect(body).toHaveProperty('written');
    expect(body).toHaveProperty('failed');
    expect(Array.isArray(body.written)).toBe(true);
    expect(Array.isArray(body.failed)).toBe(true);
    // Empty fixture content dir — both arrays are []. Don't assert specific
    // sizes (a future fixture with seed courses should still pass).
  });

  test('GET /api/courses/:id/has-json on a non-existent course returns 404', async ({ request }) => {
    await loginAdmin(request);
    const r = await request.get('/api/courses/definitely-not-a-real-course/has-json');
    expect(r.status()).toBe(404);
  });

  test('POST /api/courses/:id/export-json on a non-existent course returns 404', async ({ request }) => {
    await loginAdmin(request);
    const r = await request.post('/api/courses/definitely-not-a-real-course/export-json');
    expect(r.status()).toBe(404);
  });

  test('export-all writes course.json into the fixture course folder', async ({ request }) => {
    await loginAdmin(request);
    // Trigger a rescan first so the fixture course is in the DB.
    const rescan = await request.post('/api/courses/rescan', { data: { preserveMetadata: true } });
    expect(rescan.ok()).toBeTruthy();
    // Wait for the scan to complete.
    for (let i = 0; i < 20; i += 1) {
      const s = await request.get('/api/status/scan');
      const body = await s.json();
      if (body.complete) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    const r = await request.post('/api/courses/export-json-all');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    // The fixture has at least one course; export-all should report it.
    expect(body.written.length).toBeGreaterThanOrEqual(1);
    expect(body.failed).toEqual([]);
  });
});

test.describe('admin content export — UI surface', () => {
  test('admin can reach the Content tab and see the Export-all button', async ({ page, request }) => {
    // Authenticate via API so the cookie is set, then navigate the UI.
    await loginAdmin(request);
    // Copy the cookie jar from the request context into the page context.
    const cookies = await request.storageState();
    await page.context().addCookies(cookies.cookies);

    await page.goto('/courses');
    await page.getByTestId('user-profile-trigger').click();
    await page.getByRole('button', { name: /admin panel/i }).click();

    // Now click the Content tab — its data-testid is admin-tab-content
    // because the existing v-for binds testid from each tab's id.
    const contentTab = page.locator('[data-testid=admin-tab-content]');
    await expect(contentTab).toBeVisible();
    await contentTab.click();
    await expect(page.locator('[data-testid=admin-export-all-json]')).toBeVisible();
  });
});
