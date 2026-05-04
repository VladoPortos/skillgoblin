import { test, expect, request as pwRequest } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://web:3000' });
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

// Create a regular user, activate them as admin, log them in. Returns the
// user record and an authenticated request context.
async function createAndLoginPleb(name) {
  const password = 'pleb1234';
  const create = await (await freshContext()).post('/api/users', {
    data: { name: `${name}-${Date.now()}`, password }
  });
  const pleb = await create.json();

  const { ctx: adminCtx } = await loginAdmin();
  const activate = await adminCtx.put('/api/users', {
    data: { id: pleb.id, name: pleb.name, is_active: 1 }
  });
  expect(activate.ok()).toBeTruthy();
  await adminCtx.dispose();

  const userCtx = await freshContext();
  const login = await userCtx.post('/api/users/auth', {
    data: { userId: pleb.id, password }
  });
  expect((await login.json()).success).toBe(true);
  return { pleb, userCtx, password };
}

test.describe('GET /api/users/[id]/sessions', () => {
  test('anon → 401', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    const r = await ctx.get(`/api/users/${admin.id}/sessions`);
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('non-admin → 403 even when reading own sessions', async () => {
    const { pleb, userCtx } = await createAndLoginPleb('sess-pleb');
    const r = await userCtx.get(`/api/users/${pleb.id}/sessions`);
    expect(r.status()).toBe(403);
    await userCtx.dispose();
  });

  test('admin → 200 with array of session metadata (no token_hash exposed)', async () => {
    const { ctx, admin } = await loginAdmin();
    const r = await ctx.get(`/api/users/${admin.id}/sessions`);
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    const row = body[0];
    expect(row).toHaveProperty('created_at');
    expect(row).toHaveProperty('expires_at');
    expect(row).toHaveProperty('last_seen_at');
    expect(row).toHaveProperty('user_agent');
    expect(row).not.toHaveProperty('token_hash');
    await ctx.dispose();
  });
});

test.describe('POST /api/users/[id]/kick-sessions', () => {
  test('anon → 401', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    const r = await ctx.post(`/api/users/${admin.id}/kick-sessions`);
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('non-admin → 403 even when kicking own sessions', async () => {
    const { pleb, userCtx } = await createAndLoginPleb('kick-pleb');
    const r = await userCtx.post(`/api/users/${pleb.id}/kick-sessions`);
    expect(r.status()).toBe(403);
    await userCtx.dispose();
  });

  test('admin kicking another user invalidates their session cookie', async () => {
    const { pleb, userCtx } = await createAndLoginPleb('kick-target');

    // Verify target is currently logged in.
    const before = await userCtx.get('/api/auth/me');
    expect(before.ok()).toBeTruthy();

    const { ctx: adminCtx } = await loginAdmin();
    const kick = await adminCtx.post(`/api/users/${pleb.id}/kick-sessions`);
    expect(kick.ok()).toBeTruthy();
    const body = await kick.json();
    expect(body.kicked).toBeGreaterThanOrEqual(1);
    await adminCtx.dispose();

    // Target's cookie should no longer authenticate.
    const after = await userCtx.get('/api/auth/me');
    expect(after.status()).toBe(401);
    await userCtx.dispose();
  });

  test('admin can kick own sessions (no last-admin protection on kick — sessions are not role/active state)', async () => {
    const { ctx, admin } = await loginAdmin();
    const r = await ctx.post(`/api/users/${admin.id}/kick-sessions`);
    expect(r.ok()).toBeTruthy();
    // After self-kick, the next request is unauthenticated.
    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(401);
    await ctx.dispose();
  });

  test('admin GET on unknown user → 404', async () => {
    const { ctx } = await loginAdmin();
    const r = await ctx.get('/api/users/no-such-id/sessions');
    expect(r.status()).toBe(404);
    await ctx.dispose();
  });

  test('admin POST kick on unknown user → 404', async () => {
    const { ctx } = await loginAdmin();
    const r = await ctx.post('/api/users/no-such-id/kick-sessions');
    expect(r.status()).toBe(404);
    await ctx.dispose();
  });
});

test.describe('AdminPanel — visibility & users list', () => {
  test('admin sees "Admin Panel" entry in dropdown; opening it shows the users list', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', {
      data: { userId: admin.id, password: ADMIN_PASSWORD }
    });

    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    await page.locator('.user-profile').click();
    const adminEntry = page.getByRole('button', { name: /admin panel/i });
    await expect(adminEntry).toBeVisible();
    await adminEntry.click();

    // Panel header + admin's own row both visible.
    await expect(page.getByTestId('admin-panel')).toBeVisible();
    await expect(page.getByTestId('users-table')).toBeVisible();
    await expect(page.getByTestId('users-table')).toContainText(admin.name);
  });

  test('non-admin does not see the Admin Panel entry', async ({ page, browser }) => {
    const create = await page.request.post('/api/users', {
      data: { name: `panel-pleb-${Date.now()}`, password: 'pleb1234' }
    });
    const pleb = await create.json();

    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, is_active: 1 } });
    await adminCtx.dispose();

    await page.request.post('/api/users/auth', { data: { userId: pleb.id, password: 'pleb1234' } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    await page.locator('.user-profile').click();
    await expect(page.getByRole('button', { name: /admin panel/i })).toHaveCount(0);
  });
});

// Helpers shared by row-action tests.
async function openPanelAsAdmin(page) {
  const admin = await getAdmin(page.request);
  await page.request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  await page.goto('/courses');
  await page.waitForLoadState('networkidle');
  await page.locator('.user-profile').click();
  await page.getByRole('button', { name: /admin panel/i }).click();
  await page.getByTestId('users-table').waitFor();
  return admin;
}

async function createPendingPleb(request, label) {
  const password = 'pleb1234';
  const create = await request.post('/api/users', {
    data: { name: `${label}-${Date.now()}`, password }
  });
  const pleb = await create.json();
  return { pleb, password };
}

test.describe('AdminPanel — row actions', () => {
  test('activate a pending user via panel', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'act');
    await openPanelAsAdmin(page);

    const row = page.getByTestId(`user-row-${pleb.id}`);
    await expect(row).toContainText('pending');
    await row.getByRole('button', { name: /activate/i }).click();
    await expect(row).toContainText('active');
  });

  test('promote then demote a regular user', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'role');
    await openPanelAsAdmin(page);

    // Activate first so we can verify role transitions independent of activation.
    const row = page.getByTestId(`user-row-${pleb.id}`);
    await row.getByRole('button', { name: /activate/i }).click();
    await expect(row).toContainText('active');

    await row.getByRole('button', { name: /^promote$/i }).click();
    await expect(row).toContainText('admin');

    await row.getByRole('button', { name: /^demote$/i }).click();
    await expect(row).toContainText('user');
  });

  test('reset password lets the user log in with the new password', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'reset');
    await openPanelAsAdmin(page);

    const row = page.getByTestId(`user-row-${pleb.id}`);
    await row.getByRole('button', { name: /activate/i }).click();
    await expect(row).toContainText('active');

    await row.getByRole('button', { name: /reset pwd/i }).click();
    await row.getByTestId('reset-input').fill('NewSecret123');
    await row.getByTestId('reset-submit').click();
    // Form clears after success.
    await expect(row.getByTestId('reset-input')).toHaveCount(0);

    const userCtx = await freshContext();
    const r = await userCtx.post('/api/users/auth', {
      data: { userId: pleb.id, password: 'NewSecret123' }
    });
    expect((await r.json()).success).toBe(true);
    await userCtx.dispose();
  });

  test('kick sessions invalidates the target user cookie', async ({ page }) => {
    const { pleb, password } = await createPendingPleb(page.request, 'kick');
    // Activate, log in as the pleb, save cookie, then kick from admin panel.
    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, is_active: 1 } });
    await adminCtx.dispose();

    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: pleb.id, password } });
    expect((await userCtx.get('/api/auth/me')).ok()).toBeTruthy();

    await openPanelAsAdmin(page);
    const row = page.getByTestId(`user-row-${pleb.id}`);
    await row.getByRole('button', { name: /kick/i }).click();
    // Confirm modal then click confirm
    await page.getByRole('button', { name: /^kick sessions$/i }).click();

    // User's cookie should be dead.
    await expect.poll(async () => (await userCtx.get('/api/auth/me')).status()).toBe(401);
    await userCtx.dispose();
  });

  test('delete removes the user row from the table', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'del');
    await openPanelAsAdmin(page);

    const row = page.getByTestId(`user-row-${pleb.id}`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /^delete user$/i }).click();
    await expect(page.getByTestId(`user-row-${pleb.id}`)).toHaveCount(0);
  });

  // Regression for Codex BLOCKER (Phase 4): admin row actions used to clobber
  // avatars because PUT /api/users always wrote `avatar = ?` and AdminPanel
  // only sent {id, name, ...}. Server now leaves avatar untouched if the
  // body field is undefined.
  test('avatar survives activate / promote / reset actions from admin panel', async ({ page }) => {
    // Create + give a recognizable avatar string.
    const password = 'pleb1234';
    const created = await page.request.post('/api/users', {
      data: { name: `avatar-${Date.now()}`, password }
    });
    const pleb = await created.json();
    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    const avatarJson = JSON.stringify({ skinTone: 'light', hair: 'short' });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, avatar: avatarJson } });
    await adminCtx.dispose();

    await openPanelAsAdmin(page);
    const row = page.getByTestId(`user-row-${pleb.id}`);

    // Activate.
    await row.getByRole('button', { name: /activate/i }).click();
    await expect(row).toContainText('active');
    let after = (await (await page.request.get('/api/users')).json()).find(u => u.id === pleb.id);
    expect(after.avatar).toBe(avatarJson);

    // Promote then immediately demote so we don't leave a second admin
    // and break downstream last-admin protection tests.
    await row.getByRole('button', { name: /^promote$/i }).click();
    after = (await (await page.request.get('/api/users')).json()).find(u => u.id === pleb.id);
    expect(after.avatar).toBe(avatarJson);
    await row.getByRole('button', { name: /^demote$/i }).click();
    await expect(row).toContainText('user');

    // Reset password.
    await row.getByRole('button', { name: /reset pwd/i }).click();
    await row.getByTestId('reset-input').fill('NewerSecret456');
    await row.getByTestId('reset-submit').click();
    await expect(row.getByTestId('reset-input')).toHaveCount(0);
    after = (await (await page.request.get('/api/users')).json()).find(u => u.id === pleb.id);
    expect(after.avatar).toBe(avatarJson);
  });

  // Regression for Codex HIGH (Phase 4): admin reset-PIN must reject anything
  // that isn't 4 digits, otherwise the login UI can't reproduce the value.
  test('reset PIN rejects non-4-digit input client-side and surfaces an error', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'pin-validate');
    await openPanelAsAdmin(page);

    const row = page.getByTestId(`user-row-${pleb.id}`);
    await row.getByRole('button', { name: /activate/i }).click();
    await expect(row).toContainText('active');

    await row.getByRole('button', { name: /reset pin/i }).click();
    await row.getByTestId('reset-input').fill('abc');
    await row.getByTestId('reset-submit').click();
    await expect(page.getByTestId('action-error')).toContainText(/4 digits/i);
    // Form stays open so the admin can correct.
    await expect(row.getByTestId('reset-input')).toBeVisible();
  });
});

// system_settings GET returns string "true"/"false" — coerce to a real bool.
function asBool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

async function setSystemSetting(request, key, value) {
  const r = await request.put('/api/system-settings', { data: { key, value: !!value } });
  expect(r.ok(), `failed to set ${key}=${value}`).toBeTruthy();
}

test.describe('AdminPanel — system settings tab', () => {
  test('toggling allow_pin off persists through the public GET endpoint', async ({ page }) => {
    // Set a known starting state and capture it for restore.
    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    await setSystemSetting(adminCtx, 'allow_pin', true);
    await adminCtx.dispose();

    await openPanelAsAdmin(page);
    await page.getByTestId('admin-tab-settings').click();
    await page.getByTestId('settings-allow-pin').waitFor();

    const checkbox = page.getByTestId('settings-allow-pin');
    expect(await checkbox.isChecked()).toBe(true);

    await checkbox.uncheck();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-saved')).toBeVisible();

    const after = await (await page.request.get('/api/system-settings')).json();
    expect(asBool(after.allow_pin)).toBe(false);

    // Restore so downstream tests start from the documented default.
    await setSystemSetting(page.request, 'allow_pin', true);
  });

  test('toggling auto_approve_new_users on persists through the public GET endpoint', async ({ page }) => {
    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    await setSystemSetting(adminCtx, 'auto_approve_new_users', false);
    await adminCtx.dispose();

    await openPanelAsAdmin(page);
    await page.getByTestId('admin-tab-settings').click();
    await page.getByTestId('settings-auto-approve').waitFor();

    const checkbox = page.getByTestId('settings-auto-approve');
    expect(await checkbox.isChecked()).toBe(false);

    await checkbox.check();
    await page.getByTestId('settings-save').click();
    await expect(page.getByTestId('settings-saved')).toBeVisible();

    const after = await (await page.request.get('/api/system-settings')).json();
    expect(asBool(after.auto_approve_new_users)).toBe(true);

    await setSystemSetting(page.request, 'auto_approve_new_users', false);
  });
});

test.describe('UserManagement — encourage-both hint', () => {
  test('hint text is visible in change/switch tabs', async ({ page }) => {
    const admin = await getAdmin(page.request);
    await page.request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /my profile/i }).click();
    await expect(page.getByTestId('encourage-both-hint')).toBeVisible();
  });
});

test.describe('AdminPanel — sessions drilldown', () => {
  test('clicking Sessions opens a drilldown listing the user\'s active sessions', async ({ page }) => {
    const admin = await openPanelAsAdmin(page);

    const row = page.getByTestId(`user-row-${admin.id}`);
    await row.getByRole('button', { name: /^sessions$/i }).click();

    const drilldown = page.getByTestId('sessions-drilldown');
    await expect(drilldown).toBeVisible();
    // At least the admin session we just created is listed (earlier tests'
    // disposed contexts may also have left orphaned admin sessions, so we
    // can't assert an exact count).
    await expect(drilldown.getByTestId('session-row').first()).toBeVisible({ timeout: 5000 });
  });

  test('pending-only filter hides active users; toggling off restores them', async ({ page }) => {
    const { pleb } = await createPendingPleb(page.request, 'pending-filter');
    const admin = await openPanelAsAdmin(page);

    // Both rows visible initially.
    await expect(page.getByTestId(`user-row-${pleb.id}`)).toBeVisible();
    await expect(page.getByTestId(`user-row-${admin.id}`)).toBeVisible();

    await page.getByTestId('filter-pending').click();
    // Pending pleb visible, active admin hidden.
    await expect(page.getByTestId(`user-row-${pleb.id}`)).toBeVisible();
    await expect(page.getByTestId(`user-row-${admin.id}`)).toHaveCount(0);

    // Toggle off — admin row returns.
    await page.getByTestId('filter-pending').click();
    await expect(page.getByTestId(`user-row-${admin.id}`)).toBeVisible();
  });

  test('drilldown Kick-all button empties the listed sessions', async ({ page }) => {
    const { pleb, password } = await createPendingPleb(page.request, 'sess-kick');
    // Activate + log target in so they have a session.
    const adminCtx = await freshContext();
    const adminUser = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: adminUser.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, is_active: 1 } });
    await adminCtx.dispose();

    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: pleb.id, password } });
    await userCtx.dispose();

    await openPanelAsAdmin(page);
    const row = page.getByTestId(`user-row-${pleb.id}`);
    await row.getByRole('button', { name: /^sessions$/i }).click();

    const drilldown = page.getByTestId('sessions-drilldown');
    await expect(drilldown.getByTestId('session-row').first()).toBeVisible();

    await drilldown.getByTestId('drilldown-kick-all').click();
    await expect(drilldown.getByTestId('session-row')).toHaveCount(0);
  });
});

test.describe('GET /api/system-settings → allow_user_registration', () => {
  test('returns allow_user_registration in the payload', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/system-settings');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body).toHaveProperty('allow_user_registration');
    expect(['true', 'false']).toContain(body.allow_user_registration);
    await ctx.dispose();
  });

  test('admin can update allow_user_registration via PUT', async () => {
    const { ctx } = await loginAdmin();
    // Flip to false then back to true to leave the suite in the default state.
    let r = await ctx.put('/api/system-settings', {
      data: { key: 'allow_user_registration', value: false }
    });
    expect(r.ok()).toBeTruthy();
    let body = await r.json();
    expect(body.allow_user_registration).toBe('false');

    r = await ctx.put('/api/system-settings', {
      data: { key: 'allow_user_registration', value: true }
    });
    expect(r.ok()).toBeTruthy();
    body = await r.json();
    expect(body.allow_user_registration).toBe('true');
    await ctx.dispose();
  });
});
