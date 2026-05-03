// Cosmetic-pass coverage: clicking the modal backdrop should dismiss the
// modal across the app (in addition to the existing X / Cancel buttons).
// Plus regression that the dropdown entry was renamed from "User
// Management" to "My Profile".
import { test, expect, request as pwRequest } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://app:3000' });
}

async function getAdmin(request) {
  const r = await request.get('/api/users');
  const users = await r.json();
  return users.find(u => u.name === ADMIN_NAME);
}

test.describe('Profile dropdown rename', () => {
  test('the personal profile entry is labeled "My Profile" (was "User Management")', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.locator('.user-profile').click();
    await expect(page.getByRole('button', { name: /^my profile$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /user management/i })).toHaveCount(0);
  });
});

test.describe('Backdrop click dismisses modals', () => {
  test('Admin Panel closes on backdrop click', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /admin panel/i }).click();
    await expect(page.getByTestId('admin-panel')).toBeVisible();

    // Click in the corner — reliably the backdrop, not the inner panel.
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('admin-panel')).toHaveCount(0);
  });

  test('My Profile modal closes on backdrop click', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /^my profile$/i }).click();
    await expect(page.getByText('My Profile', { exact: true })).toBeVisible();

    await page.mouse.click(5, 5);
    // Modal heading no longer in DOM.
    await expect(page.getByText('My Profile', { exact: true })).toHaveCount(0);
  });

  test('Login auth modal closes on backdrop click', async ({ page }) => {
    // Need a target user the picker will route to the auth modal.
    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', {
      data: { name: `dismiss-auth-${Date.now()}`, password: 'Pwd1234567' }
    })).json();
    const adminCtx = await freshContext();
    const admin = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: created.id, name: created.name, is_active: 1 } });
    await adminCtx.dispose();
    await ctx.dispose();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(created.name).click();

    // Auth modal heading is "Authentication Required".
    await expect(page.getByText('Authentication Required')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByText('Authentication Required')).toHaveCount(0);
  });

  test('Create User signup modal closes on backdrop click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByText('New User', { exact: true }).click();
    await expect(page.getByText('Create New User')).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(page.getByText('Create New User')).toHaveCount(0);
  });
});
