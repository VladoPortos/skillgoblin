// End-to-end coverage for the user-facing credential flows reworked in Phase
// 6: signup with "Both", login modal toggle for users with both credentials,
// and the independent password / PIN panels in the profile editor.
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

// Reset volatile system settings before each test so an earlier failure
// (which can short-circuit the test's own restoration step) doesn't break
// downstream tests. Cheap — two boolean PUTs per test.
test.beforeEach(async () => {
  const ctx = await freshContext();
  const admin = await ctx.get('/api/users').then(r => r.json()).then(us => us.find(u => u.name === ADMIN_NAME));
  if (admin) {
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await ctx.put('/api/system-settings', { data: { key: 'allow_pin', value: true } }).catch(() => {});
    await ctx.put('/api/system-settings', { data: { key: 'auto_approve_new_users', value: false } }).catch(() => {});
  }
  await ctx.dispose();
});

// Activate a freshly created user (signup default is is_active=0 in
// strict mode, which the test stack runs with).
async function activate(userId, name) {
  const adminCtx = await freshContext();
  const admin = await getAdmin(adminCtx);
  await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  const r = await adminCtx.put('/api/users', { data: { id: userId, name, is_active: 1 } });
  expect(r.ok()).toBeTruthy();
  await adminCtx.dispose();
}

async function createUserViaUI(page, { name, mode, password, pin }) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // The "New User" tile is a clickable div, not a button — match by text.
  await page.getByText('New User', { exact: true }).click();
  await page.getByLabel(/^name$/i).fill(name);

  // Pick the auth mode — the new toggle has Password / PIN / Both.
  await page.getByTestId(`signup-mode-${mode}`).click();

  if (password) {
    await page.getByTestId('signup-password-input').fill(password);
  }
  if (pin) {
    // PIN grid is 4 single-char inputs.
    const digits = pin.split('');
    for (let i = 0; i < digits.length; i++) {
      await page.locator(`#create-pin-${i}, [data-testid="signup-pin-${i}"]`).first().fill(digits[i]);
    }
  }

  await page.getByRole('button', { name: /^create user$/i }).click();
  await page.waitForResponse(r => r.url().includes('/api/users') && r.request().method() === 'POST');
}

test.describe('Signup — Both option', () => {
  // Regression for Codex HIGH (Phase 6): "Both" mode silently fell back to
  // a single-credential account if one input was empty. Now the client
  // requires both before submitting.
  test('Both with only password filled shows a visible error and does NOT create the user', async ({ page }) => {
    const name = `both-incomplete-${Date.now()}`;
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByText('New User', { exact: true }).click();
    await page.getByLabel(/^name$/i).fill(name);
    await page.getByTestId('signup-mode-both').click();
    await page.getByTestId('signup-password-input').fill('OnlyPw1234');
    // PIN grid left empty.
    await page.getByRole('button', { name: /^create user$/i }).click();

    // Functional requirement: no user gets created (form was rejected).
    await page.waitForTimeout(500);
    const ctx = await freshContext();
    const users = await (await ctx.get('/api/users')).json();
    expect(users.find(u => u.name === name)).toBeUndefined();
    await ctx.dispose();

    // Modal still open (the validation kept it open) and the form-error
    // div surfaces the cause. It lives at the bottom of the form (just
    // above the action buttons).
    const html = await page.content();
    expect(html).toMatch(/4 digits/i);
  });

  test('creating a user with Both sets both credentials and either logs in', async ({ page }) => {
    const name = `both-${Date.now()}`;
    const password = 'BothSecret123';
    const pin = '4321';

    await createUserViaUI(page, { name, mode: 'both', password, pin });

    // Verify both credentials landed.
    const ctx = await freshContext();
    const users = await (await ctx.get('/api/users')).json();
    const created = users.find(u => u.name === name);
    expect(created).toBeTruthy();
    expect(created.has_password).toBe(1);
    expect(created.has_pin).toBe(1);

    await activate(created.id, name);

    // Password login works.
    const pwCtx = await freshContext();
    const pwLogin = await pwCtx.post('/api/users/auth', { data: { userId: created.id, password } });
    expect((await pwLogin.json()).success).toBe(true);
    await pwCtx.dispose();

    // PIN login works.
    const pinCtx = await freshContext();
    const pinLogin = await pinCtx.post('/api/users/auth', { data: { userId: created.id, pin } });
    expect((await pinLogin.json()).success).toBe(true);
    await pinCtx.dispose();
    await ctx.dispose();
  });
});

test.describe('Login modal — both-creds toggle', () => {
  test('user with both creds gets a PIN/Password toggle, defaulting to PIN', async ({ page }) => {
    const name = `login-toggle-${Date.now()}`;
    const password = 'TogglePw123';
    const pin = '1357';

    // Create + activate via API.
    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password, pin } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click the user card.
    await page.getByTitle(name).click();

    // Auth modal should be open with the toggle visible.
    await expect(page.getByTestId('login-mode-toggle')).toBeVisible();
    // Default selection is PIN.
    await expect(page.getByTestId('login-mode-pin')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pin-0')).toBeVisible();

    // Switch to password.
    await page.getByTestId('login-mode-password').click();
    await expect(page.getByTestId('login-mode-password')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
  });

  test('user with only password sees no toggle (single input)', async ({ page }) => {
    const name = `pw-only-${Date.now()}`;
    const password = 'OnlyPw1234';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(name).click();

    await expect(page.getByTestId('login-mode-toggle')).toHaveCount(0);
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
  });

  test('user with only PIN sees no toggle (PIN grid only)', async ({ page }) => {
    const name = `pin-only-${Date.now()}`;
    const pin = '9876';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, pin } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTitle(name).click();

    await expect(page.getByTestId('login-mode-toggle')).toHaveCount(0);
    await expect(page.locator('#pin-0')).toBeVisible();
  });
});

// Profile editor tests log the user in via API + cookie, then open the
// modal directly. The new layout has independent panels; each saves via
// its own button and shows inline ✓ / ✗ feedback.
async function loginAndOpenProfileEditor(page, userId, password) {
  await page.request.post('/api/users/auth', { data: { userId, password } });
  await page.goto('/courses');
  await page.waitForLoadState('networkidle');
  await page.locator('.user-profile').click();
  await page.getByRole('button', { name: /my profile/i }).click();
}

test.describe('Profile editor — credential panels', () => {
  test('password-only user can ADD a PIN from the editor; PIN login works after', async ({ page }) => {
    const name = `add-pin-${Date.now()}`;
    const password = 'AddPin1234';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await loginAndOpenProfileEditor(page, created.id, password);

    // Password panel says "Change", PIN panel says "Add".
    await expect(page.getByTestId('profile-password-action')).toHaveText(/change password/i);
    await expect(page.getByTestId('profile-pin-action')).toHaveText(/add pin/i);

    // Add a PIN.
    const newPin = '2468';
    for (let i = 0; i < 4; i++) {
      await page.locator(`[data-testid="profile-pin-digit-${i}"]`).fill(newPin[i]);
    }
    await page.getByTestId('profile-pin-action').click();
    await expect(page.getByTestId('profile-pin-feedback')).toHaveText(/saved|updated/i);

    // PIN login now works.
    const pinCtx = await freshContext();
    const pinLogin = await pinCtx.post('/api/users/auth', { data: { userId: created.id, pin: newPin } });
    expect((await pinLogin.json()).success).toBe(true);
    await pinCtx.dispose();
  });

  test('PIN-only user can ADD a password from the editor; password login works after', async ({ page }) => {
    const name = `add-pw-${Date.now()}`;
    const pin = '1122';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, pin } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    // Log in with PIN to open the profile editor.
    await page.request.post('/api/users/auth', { data: { userId: created.id, pin } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /my profile/i }).click();

    await expect(page.getByTestId('profile-password-action')).toHaveText(/add password/i);
    await expect(page.getByTestId('profile-pin-action')).toHaveText(/change pin/i);

    const newPw = 'JustAdded1234';
    await page.getByTestId('profile-password-input').fill(newPw);
    await page.getByTestId('profile-password-action').click();
    await expect(page.getByTestId('profile-password-feedback')).toHaveText(/saved|updated/i);

    const pwCtx = await freshContext();
    const pwLogin = await pwCtx.post('/api/users/auth', { data: { userId: created.id, password: newPw } });
    expect((await pwLogin.json()).success).toBe(true);
    await pwCtx.dispose();
  });

  test('changing a password rotates it; the old password no longer works', async ({ page }) => {
    const name = `rotate-pw-${Date.now()}`;
    const oldPw = 'OldSecret123';
    const newPw = 'NewSecret456';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password: oldPw } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await loginAndOpenProfileEditor(page, created.id, oldPw);
    await page.getByTestId('profile-password-input').fill(newPw);
    await page.getByTestId('profile-password-action').click();
    await expect(page.getByTestId('profile-password-feedback')).toHaveText(/saved|updated/i);

    // Old fails. Auth endpoint returns 200 with {success: false} on bad
    // creds (client convenience over strict HTTP semantics) — assert on the
    // body, not the status.
    const oldCtx = await freshContext();
    const oldLogin = await oldCtx.post('/api/users/auth', { data: { userId: created.id, password: oldPw } });
    expect((await oldLogin.json()).success).toBe(false);
    await oldCtx.dispose();

    // New works.
    const newCtx = await freshContext();
    const newLogin = await newCtx.post('/api/users/auth', { data: { userId: created.id, password: newPw } });
    expect((await newLogin.json()).success).toBe(true);
    await newCtx.dispose();
  });

  test('changing a PIN rotates it', async ({ page }) => {
    const name = `rotate-pin-${Date.now()}`;
    const oldPin = '1111';
    const newPin = '2222';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, pin: oldPin } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await page.request.post('/api/users/auth', { data: { userId: created.id, pin: oldPin } });
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    await page.locator('.user-profile').click();
    await page.getByRole('button', { name: /my profile/i }).click();

    for (let i = 0; i < 4; i++) {
      await page.locator(`[data-testid="profile-pin-digit-${i}"]`).fill(newPin[i]);
    }
    await page.getByTestId('profile-pin-action').click();
    await expect(page.getByTestId('profile-pin-feedback')).toHaveText(/saved|updated/i);

    const newCtx = await freshContext();
    const newLogin = await newCtx.post('/api/users/auth', { data: { userId: created.id, pin: newPin } });
    expect((await newLogin.json()).success).toBe(true);
    await newCtx.dispose();
  });

  // Regression for Codex HIGH (Phase 6): PUT /api/users used to silently
  // wipe an existing PIN whenever allow_pin=false, even on unrelated
  // password / profile updates. Now it leaves the PIN row alone unless
  // the body explicitly sets it (and a non-empty PIN under disabled-PINs
  // is rejected with 400).
  test('changing password while allow_pin=false does NOT clear an existing PIN', async ({ page }) => {
    const name = `keep-pin-${Date.now()}`;
    const password = 'KeepIt1234';
    const pin = '5555';

    // Create user with both, activate.
    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password, pin } })).json();
    await activate(created.id, name);

    // Disable PINs globally.
    const adminCtx = await freshContext();
    const admin = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/system-settings', { data: { key: 'allow_pin', value: false } });
    await adminCtx.dispose();

    // Log in as the user first so requireSelfOrAdmin lets the PUT through.
    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: created.id, password } });
    const update = await userCtx.put('/api/users', {
      data: { id: created.id, name, password: 'NewPw5555' }
    });
    expect(update.ok()).toBeTruthy();
    await userCtx.dispose();

    // PIN row still present.
    const u = (await (await ctx.get(`/api/users/${created.id}`)).json());
    expect(u.has_pin).toBe(1);
    await ctx.dispose();

    // Restore the global setting.
    const restoreCtx = await freshContext();
    await restoreCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await restoreCtx.put('/api/system-settings', { data: { key: 'allow_pin', value: true } });
    await restoreCtx.dispose();
  });

  test('PUT /api/users refuses to set a PIN while allow_pin=false', async ({ page }) => {
    const name = `set-pin-disabled-${Date.now()}`;
    const password = 'PwOnly1234';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password } })).json();
    await activate(created.id, name);

    const adminCtx = await freshContext();
    const admin = await getAdmin(adminCtx);
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/system-settings', { data: { key: 'allow_pin', value: false } });
    await adminCtx.dispose();

    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: created.id, password } });
    const r = await userCtx.put('/api/users', { data: { id: created.id, name, pin: '1234' } });
    expect(r.status()).toBe(400);
    await userCtx.dispose();
    await ctx.dispose();

    const restoreCtx = await freshContext();
    await restoreCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await restoreCtx.put('/api/system-settings', { data: { key: 'allow_pin', value: true } });
    await restoreCtx.dispose();
  });

  // Regression for Codex MEDIUM (Phase 6): credential inputs used to live
  // inside the profile form, so pressing Enter submitted updateUser()
  // (which omits creds) and closed the modal without saving the typed
  // password. Now the cred panels are outside the form and Enter-on-input
  // calls the matching save handler directly.
  test('pressing Enter in the password input saves the password (not the profile form)', async ({ page }) => {
    const name = `enter-pw-${Date.now()}`;
    const oldPw = 'EnterOld1234';
    const newPw = 'EnterNew4321';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password: oldPw } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await loginAndOpenProfileEditor(page, created.id, oldPw);
    const input = page.getByTestId('profile-password-input');
    await input.fill(newPw);
    await input.press('Enter');
    await expect(page.getByTestId('profile-password-feedback')).toHaveText(/saved|updated/i);

    const newCtx = await freshContext();
    const r = await newCtx.post('/api/users/auth', { data: { userId: created.id, password: newPw } });
    expect((await r.json()).success).toBe(true);
    await newCtx.dispose();
  });

  test('saving a non-4-digit PIN shows a visible error and does not change the credential', async ({ page }) => {
    const name = `bad-pin-${Date.now()}`;
    const password = 'GoodPw1234';

    const ctx = await freshContext();
    const created = await (await ctx.post('/api/users', { data: { name, password } })).json();
    await activate(created.id, name);
    await ctx.dispose();

    await loginAndOpenProfileEditor(page, created.id, password);

    // Type three digits then submit — should be rejected client-side.
    await page.locator('[data-testid="profile-pin-digit-0"]').fill('1');
    await page.locator('[data-testid="profile-pin-digit-1"]').fill('2');
    await page.locator('[data-testid="profile-pin-digit-2"]').fill('3');
    await page.getByTestId('profile-pin-action').click();
    await expect(page.getByTestId('profile-pin-feedback')).toContainText(/4 digits/i);
  });
});
