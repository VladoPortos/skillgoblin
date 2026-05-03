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

async function loginAdmin() {
  const ctx = await freshContext();
  const admin = await getAdmin(ctx);
  await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  return { ctx, admin };
}

async function setRegistration(allowed) {
  const { ctx } = await loginAdmin();
  const r = await ctx.put('/api/system-settings', {
    data: { key: 'allow_user_registration', value: !!allowed }
  });
  expect(r.ok()).toBeTruthy();
  await ctx.dispose();
}

test.describe('POST /api/users — registration lock', () => {
  test.afterEach(async () => {
    // Always leave the system back at allowed=true so unrelated suites are
    // not affected.
    await setRegistration(true);
  });

  test('anon signup succeeds when registration allowed (unchanged behavior)', async () => {
    await setRegistration(true);
    const ctx = await freshContext();
    const r = await ctx.post('/api/users', {
      data: { name: `anon-allowed-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.id).toBeTruthy();
    await ctx.dispose();
  });

  test('anon signup is refused with 403 when registration disabled', async () => {
    await setRegistration(false);
    const ctx = await freshContext();
    const r = await ctx.post('/api/users', {
      data: { name: `anon-blocked-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test('admin can create a user even when registration disabled', async () => {
    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const name = `admin-created-${Date.now()}`;
    const r = await ctx.post('/api/users', {
      data: { name, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe(name);
    expect(body.is_active).toBe(1); // admin-created → always active
    expect(body.isAdmin).toBe(0);   // admin-created → always normal user
    await ctx.dispose();
  });

  test('admin-created user is active even when auto_approve_new_users=false', async () => {
    // Toggle auto_approve_new_users off explicitly.
    const { ctx: adm } = await loginAdmin();
    await adm.put('/api/system-settings', {
      data: { key: 'auto_approve_new_users', value: false }
    });
    await adm.dispose();

    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const r = await ctx.post('/api/users', {
      data: { name: `admin-approve-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.is_active).toBe(1);
    await ctx.dispose();
  });

  test('admin-created user cannot self-promote via body.isAdmin', async () => {
    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const r = await ctx.post('/api/users', {
      data: { name: `not-admin-${Date.now()}`, password: 'pw12345!', isAdmin: 1 }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.isAdmin).toBe(0);
    await ctx.dispose();
  });

  test('non-admin authenticated user cannot create when registration disabled', async () => {
    await setRegistration(true);
    const setupCtx = await freshContext();
    const sig = await setupCtx.post('/api/users', {
      data: { name: `pleb-${Date.now()}`, password: 'pw12345!' }
    });
    const pleb = await sig.json();
    await setupCtx.dispose();

    // Activate pleb so login works under default strict-approval.
    const { ctx: adm } = await loginAdmin();
    await adm.put('/api/users', {
      data: { id: pleb.id, name: pleb.name, is_active: 1 }
    });
    await adm.dispose();

    const plebCtx = await freshContext();
    await plebCtx.post('/api/users/auth', {
      data: { userId: pleb.id, password: 'pw12345!' }
    });

    await setRegistration(false);

    const r = await plebCtx.post('/api/users', {
      data: { name: `pleb-create-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.status()).toBe(403);
    await plebCtx.dispose();
  });

  test('deactivated admin with stale cookie cannot bypass when registration disabled', async () => {
    // Create a second admin via the root admin, log them in to capture a
    // valid session cookie, then have root deactivate them. Their cookie
    // is still valid; the registration gate's `is_active` requirement on
    // isAdminCaller is the only thing standing between them and a
    // successful POST. This locks in that property so a future refactor
    // that drops the is_active check has a failing test.
    const { ctx: root } = await loginAdmin();
    const tmpName = `tmpadmin-${Date.now()}`;
    const created = await root.post('/api/users', {
      data: { name: tmpName, password: 'pw12345!' }
    });
    const tmp = await created.json();
    // Activate + promote the new admin so they can actually log in and
    // be a session-authenticated admin.
    await root.put('/api/users', {
      data: { id: tmp.id, name: tmp.name, is_active: 1, isAdmin: 1 }
    });

    // Log the temp admin in — captures their session cookie in tmpCtx.
    const tmpCtx = await freshContext();
    await tmpCtx.post('/api/users/auth', {
      data: { userId: tmp.id, password: 'pw12345!' }
    });

    // Root deactivates the temp admin. The temp's cookie is unchanged.
    await root.put('/api/users', {
      data: { id: tmp.id, name: tmp.name, is_active: 0 }
    });
    await root.dispose();

    await setRegistration(false);

    // Temp admin's POST must be refused — the gate's is_active check
    // demotes them to anonymous, and registration is disabled.
    const r = await tmpCtx.post('/api/users', {
      data: { name: `should-fail-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.status()).toBe(403);
    await tmpCtx.dispose();
  });
});

test.describe('Login screen — New User tile', () => {
  test.afterEach(async () => {
    await setRegistration(true);
  });

  // Wait until the user-picker grid has rendered before asserting on the
  // New User tile's presence. The bootstrap admin's name is always present,
  // so its tile is a reliable "page has hydrated" signal. Without this
  // wait, an SPA-pre-hydration query would find zero "New User" elements
  // and pass the "hidden" test for the wrong reason.
  async function gotoAndWaitForPicker(page) {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(ADMIN_NAME, { exact: true })).toBeVisible();
  }

  test('tile is visible when registration allowed', async ({ page }) => {
    await setRegistration(true);
    await gotoAndWaitForPicker(page);
    await expect(page.getByText('New User', { exact: true })).toBeVisible();
  });

  test('tile is hidden when registration disabled', async ({ page }) => {
    await setRegistration(false);
    await gotoAndWaitForPicker(page);
    // Picker has rendered (admin tile is visible). The absence of the
    // "New User" tile now means the v-if removed it — not that the SPA
    // hadn't loaded yet.
    await expect(page.getByText('New User', { exact: true })).toHaveCount(0);
  });
});

test.describe('AdminPanel — Create User', () => {
  test.afterEach(async () => {
    await setRegistration(true);
  });

  test('admin can create an active normal user via the panel UI', async ({ page }) => {
    // Disable registration to prove the admin-create path is independent.
    await setRegistration(false);

    // Log in as admin via the API so the cookie is on the page context —
    // matches the pattern used by the existing admin-panel spec.
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', {
      data: { userId: admin.id, password: ADMIN_PASSWORD }
    });

    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    // Open the user-profile dropdown and click "Admin Panel" — same
    // selectors as admin-panel.spec.js.
    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /admin panel/i }).click();
    await expect(page.getByTestId('admin-panel')).toBeVisible();

    // Open the create modal.
    await page.getByTestId('admin-create-user').click();
    await expect(page.getByTestId('admin-create-user-modal')).toBeVisible();

    const newName = `panel-created-${Date.now()}`;
    await page.getByTestId('admin-create-name').fill(newName);
    await page.getByTestId('admin-create-password').fill('pw12345!');
    await page.getByTestId('admin-create-submit').click();

    // After success the modal closes and the new user appears in the table
    // as Active + User.
    await expect(page.getByTestId('admin-create-user-modal')).toHaveCount(0);
    const row = page.getByText(newName);
    await expect(row).toBeVisible();
  });
});

test.describe('AdminPanel — Settings tab toggle', () => {
  test.afterEach(async () => {
    await setRegistration(true);
  });

  test('admin can flip allow_user_registration from the settings tab', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', {
      data: { userId: admin.id, password: ADMIN_PASSWORD }
    });

    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /admin panel/i }).click();
    await page.getByTestId('admin-tab-settings').click();

    const toggle = page.getByTestId('settings-allow-registration');
    await expect(toggle).toBeChecked(); // default true

    await toggle.uncheck();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-saved')).toBeVisible();

    // Verify via API.
    const r = await page.request.get('/api/system-settings');
    const body = await r.json();
    expect(body.allow_user_registration).toBe('false');
  });
});
