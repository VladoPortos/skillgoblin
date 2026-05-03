// Hotfix coverage for the post-merge bug: when admin disables PINs and a
// PIN-only user clicks their portrait, the picker used to silently route
// them to the bootstrap modal (wrong copy, no usable input). The auth
// endpoint already supports the PIN bridge — the fix wires the picker to
// use it and reworks the post-login modal copy + dismissibility.
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

async function loginAdmin(ctx) {
  const admin = await getAdmin(ctx);
  await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  return admin;
}

async function setSystemSetting(ctx, key, value) {
  const r = await ctx.put('/api/system-settings', { data: { key, value } });
  expect(r.ok(), `failed to set ${key}=${value}`).toBeTruthy();
}

// Reset volatile system_settings so an early-failing test doesn't leave a
// bad state for the next one.
test.beforeEach(async () => {
  const ctx = await freshContext();
  const admin = await getAdmin(ctx);
  if (admin) {
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await setSystemSetting(ctx, 'allow_pin', true);
    await setSystemSetting(ctx, 'auto_approve_new_users', false);
  }
  await ctx.dispose();
});

// Helper: create a PIN-only user, activate them, then disable PINs globally.
async function createPinOnlyUserWithPinsDisabled(name, pin) {
  const ctx = await freshContext();
  const created = await (await ctx.post('/api/users', { data: { name, pin } })).json();
  const adminCtx = await freshContext();
  const admin = await loginAdmin(adminCtx);
  await adminCtx.put('/api/users', { data: { id: created.id, name, is_active: 1 } });
  await setSystemSetting(adminCtx, 'allow_pin', false);
  await adminCtx.dispose();
  await ctx.dispose();
  return { id: created.id, name, pin, adminId: admin.id };
}

test.describe('PIN-only user when admin disabled PINs — picker routing', () => {
  test('clicking the portrait opens the regular auth modal with PIN input (not the bootstrap modal)', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-picker-${Date.now()}`, '1357');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();

    // Auth modal opens with the PIN grid — NOT the bootstrap "set credentials" modal.
    await expect(page.locator('#pin-0')).toBeVisible();
    // The bootstrap modal would carry the legacy explainer; assert it's NOT showing.
    await expect(page.getByTestId('set-creds-explainer')).toHaveCount(0);
  });

  test('after PIN auth bridge, the post-login modal shows the honest "admins disabled" copy', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-copy-${Date.now()}`, '2468');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();

    // Type the PIN.
    for (let i = 0; i < 4; i++) {
      await page.locator(`#pin-${i}`).fill(user.pin[i]);
    }
    await page.getByRole('button', { name: /^login$/i }).click();

    // Post-login modal appears.
    await expect(page.getByTestId('set-creds-title')).toContainText(/set a password/i);
    await expect(page.getByTestId('set-creds-explainer')).toContainText(/administrators/i);
    await expect(page.getByTestId('set-creds-explainer')).toContainText(/PIN-only login/i);
    // Verify-password input is present in post-login mode.
    await expect(page.getByTestId('set-creds-password-verify')).toBeVisible();
  });
});

test.describe('Post-login modal — password + verify behavior', () => {
  test('mismatched passwords keep the submit disabled and show an inline hint', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-mismatch-${Date.now()}`, '1111');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();
    for (let i = 0; i < 4; i++) await page.locator(`#pin-${i}`).fill(user.pin[i]);
    await page.getByRole('button', { name: /^login$/i }).click();

    await page.getByTestId('set-creds-password').fill('NewPwLong123');
    await page.getByTestId('set-creds-password-verify').fill('different');
    await expect(page.getByText(/passwords don't match/i)).toBeVisible();
    await expect(page.getByTestId('set-creds-submit')).toBeDisabled();
  });

  test('matching passwords save and KEEP the existing PIN row intact', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-save-${Date.now()}`, '3333');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();
    for (let i = 0; i < 4; i++) await page.locator(`#pin-${i}`).fill(user.pin[i]);
    await page.getByRole('button', { name: /^login$/i }).click();

    const newPw = 'KeepPin5555';
    await page.getByTestId('set-creds-password').fill(newPw);
    await page.getByTestId('set-creds-password-verify').fill(newPw);
    await page.getByTestId('set-creds-submit').click();

    // Wait for the PUT to land and the modal to close.
    await page.waitForURL(/\/courses/);

    // PIN row is still present (server preserves it under partial-update).
    const ctx = await freshContext();
    const u = await (await ctx.get(`/api/users/${user.id}`)).json();
    expect(u.has_password).toBe(1);
    expect(u.has_pin).toBe(1);

    // Password works for the next login.
    const pwCtx = await freshContext();
    const pwLogin = await pwCtx.post('/api/users/auth', { data: { userId: user.id, password: newPw } });
    expect((await pwLogin.json()).success).toBe(true);
    await pwCtx.dispose();

    // PIN auth is still rejected while admin keeps PINs disabled (server
    // refuses; bridge only applies when there's no password).
    const pinCtx = await freshContext();
    const pinLogin = await pinCtx.post('/api/users/auth', { data: { userId: user.id, pin: user.pin } });
    expect((await pinLogin.json()).success).toBe(false);
    await pinCtx.dispose();

    // If admin re-enables PINs later, the PIN row works again.
    const adminCtx = await freshContext();
    await loginAdmin(adminCtx);
    await setSystemSetting(adminCtx, 'allow_pin', true);
    await adminCtx.dispose();

    const pinAgain = await freshContext();
    const r = await pinAgain.post('/api/users/auth', { data: { userId: user.id, pin: user.pin } });
    expect((await r.json()).success).toBe(true);
    await pinAgain.dispose();
    await ctx.dispose();
  });
});

test.describe('Post-login modal — dismissibility', () => {
  test('the X button closes the modal and lets the user reach /courses (already authenticated)', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-x-${Date.now()}`, '4444');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();
    for (let i = 0; i < 4; i++) await page.locator(`#pin-${i}`).fill(user.pin[i]);
    await page.getByRole('button', { name: /^login$/i }).click();

    await expect(page.getByTestId('set-creds-title')).toBeVisible();
    await page.getByTestId('set-creds-close').click();

    // Modal gone, routed to /courses.
    await expect(page.getByTestId('set-creds-title')).toHaveCount(0);
    await page.waitForURL(/\/courses/);
  });

  test('clicking the backdrop dismisses the modal too', async ({ page }) => {
    const user = await createPinOnlyUserWithPinsDisabled(`pin-bridge-bg-${Date.now()}`, '5555');

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(user.name).click();
    for (let i = 0; i < 4; i++) await page.locator(`#pin-${i}`).fill(user.pin[i]);
    await page.getByRole('button', { name: /^login$/i }).click();

    await expect(page.getByTestId('set-creds-title')).toBeVisible();
    // Click the modal backdrop (top-left corner is reliably the backdrop).
    await page.mouse.click(5, 5);

    await expect(page.getByTestId('set-creds-title')).toHaveCount(0);
    await page.waitForURL(/\/courses/);
  });
});
