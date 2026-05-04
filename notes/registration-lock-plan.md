# Registration Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a runtime-toggleable `ALLOW_USER_REGISTRATION` flag that, when `false`, locks public self-signup and routes account creation through a new admin-only "Create User" modal in the AdminPanel.

**Architecture:** Same shape as the existing `allow_pin` / `auto_approve_new_users` settings. Forward-only migration `003` seeds `system_settings.allow_user_registration` from env on first boot. `/api/system-settings` whitelist + default exposes it. `POST /api/users` reads it: when `false` and the caller's session is not an admin, returns 403; when the caller IS an admin, bypasses both the registration gate and the `auto_approve_new_users` setting (admin-created users are always `is_active=1, isAdmin=0`). Login screen hides the "New User" tile when the setting is `false`. AdminPanel gains a "Create User" modal and a third settings checkbox.

**Tech Stack:** Nuxt 3 / Nitro server, Vue 3 composition API, better-sqlite3 SQLite, Vitest (unit), Playwright (e2e), Docker for the test runtime.

**Spec reference:** [notes/registration-lock-design.md](notes/registration-lock-design.md)

**Hard rules from [notes/handover.md](notes/handover.md):**
- No Claude attribution in commit messages.
- All tests run in Docker only:
  ```
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml run --rm --build tests
  ```
- One commit per logical step. Each commit must leave the suite green.

---

## File map

### New files
- `frontend/server/migrations/003_allow_user_registration.js` — seeds `system_settings.allow_user_registration` from env or default `'true'`. Idempotent.
- `frontend/tests/unit/migration_003.test.js` — vitest for the migration (fresh + upgrade + idempotency + env-driven seeding).
- `frontend/tests/e2e/registration-lock.spec.js` — Playwright covering the HTTP gate, the admin-create flow, and the login-screen UI gating.
- `notes/registration-lock-codex-prompt.md` — Codex review prompt drafted just before final commit.

### Modified files
- `frontend/server/migrations/index.js` — append `003` to the manifest.
- `frontend/server/api/system-settings/index.js` — add `'allow_user_registration'` to `KNOWN_SETTINGS` and to `readAll()` defaults.
- `frontend/server/api/users/index.js` — add the registration gate to the POST branch; admin-create skips `auto_approve_new_users` (forces `is_active=1`).
- `frontend/composables/useUserManagement.js` — extend `systemSettings` ref + `fetchSystemSettings` to surface `allow_user_registration`.
- `frontend/pages/index.vue` — `v-if` on the "New User" tile.
- `frontend/components/AdminPanel.vue` — new "Create User" button + modal on the Users tab; new toggle on the Settings tab.
- `README.md` — env vars table entry.
- `docker-compose.example.yml` — commented example line.

---

## Task 1: Migration 003 — schema + env-driven seeding

**Files:**
- Create: `frontend/server/migrations/003_allow_user_registration.js`
- Modify: `frontend/server/migrations/index.js`
- Test: `frontend/tests/unit/migration_003.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/migration_003.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';

let db;
let dbPath;
let savedEnv;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `sg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  db = new BetterSqlite3(dbPath);
  savedEnv = process.env.ALLOW_USER_REGISTRATION;
  delete process.env.ALLOW_USER_REGISTRATION;
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (savedEnv === undefined) delete process.env.ALLOW_USER_REGISTRATION;
  else process.env.ALLOW_USER_REGISTRATION = savedEnv;
});

function getSetting(key) {
  return db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key)?.value;
}

describe('003_allow_user_registration — fresh install', () => {
  it('seeds allow_user_registration=true when env unset', () => {
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });

  it('seeds allow_user_registration=false when env=false', () => {
    process.env.ALLOW_USER_REGISTRATION = 'false';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('false');
  });

  it('seeds allow_user_registration=true when env=true', () => {
    process.env.ALLOW_USER_REGISTRATION = 'true';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });

  it('falls back to true when env value is garbage', () => {
    process.env.ALLOW_USER_REGISTRATION = 'maybe';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });
});

describe('003_allow_user_registration — idempotency', () => {
  it('re-running the migration does not clobber an admin-edited value', () => {
    runMigrations(db);
    db.prepare("UPDATE system_settings SET value = 'false' WHERE key = 'allow_user_registration'").run();
    // Simulate a re-run by invoking the migration body directly. The runner
    // would skip an already-recorded migration, but the migration body itself
    // must also tolerate being applied to a partially-prepared DB.
    process.env.ALLOW_USER_REGISTRATION = 'true';
    const m = (await import('../../server/migrations/003_allow_user_registration.js')).default;
    m.up(db);
    expect(getSetting('allow_user_registration')).toBe('false');
  });
});
```

(The last `describe` block uses a top-level `await import`. Vitest supports it inside an `it` because of its async wrapper — the syntax above works because the `it` body is `async`. Replace with `import('...').then(m => m.default.up(db))` if the exact snippet causes a parse error in your environment.)

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: `migration_003.test.js` fails — `Cannot find module '../../server/migrations/003_allow_user_registration.js'` from the manifest, OR the assertions fail because the row does not exist.

- [ ] **Step 3: Create the migration file**

Create `frontend/server/migrations/003_allow_user_registration.js`:

```js
// Adds a `system_settings.allow_user_registration` toggle. When 'false',
// public POST /api/users is gated to admin-session callers; the login screen
// hides the "New User" tile.
//
// First-boot seeding: respect process.env.ALLOW_USER_REGISTRATION when it is
// exactly 'true' or 'false'. Anything else (including unset, empty, garbage)
// defaults to 'true' so existing installs upgrade with no behavior change.
//
// Idempotent: INSERT OR IGNORE leaves an admin-edited value alone on re-runs.
export default {
  name: '003_allow_user_registration',
  up(db) {
    const raw = process.env.ALLOW_USER_REGISTRATION;
    const value = raw === 'true' || raw === 'false' ? raw : 'true';
    db.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`
    ).run('allow_user_registration', value);
  }
};
```

- [ ] **Step 4: Add the migration to the manifest**

Modify `frontend/server/migrations/index.js`:

```js
import m001_initial from './001_initial.js';
import m002_auth_hardening from './002_auth_hardening.js';
import m003_allow_user_registration from './003_allow_user_registration.js';

export default [
  m001_initial,
  m002_auth_hardening,
  m003_allow_user_registration
];
```

- [ ] **Step 5: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: `migration_003.test.js` 4 tests pass; existing migrations + system-settings tests still green.

- [ ] **Step 6: Commit**

```
git add frontend/server/migrations/003_allow_user_registration.js \
        frontend/server/migrations/index.js \
        frontend/tests/unit/migration_003.test.js
git commit -m "feat(migrations): seed allow_user_registration system setting

Adds migration 003 that seeds system_settings.allow_user_registration from
\$ALLOW_USER_REGISTRATION on first boot, defaulting to 'true' when env is
unset or invalid. Idempotent on re-run; preserves admin-edited values."
```

---

## Task 2: Expose `allow_user_registration` from `/api/system-settings`

**Files:**
- Modify: `frontend/server/api/system-settings/index.js`
- Test: `frontend/tests/unit/system-settings-helpers.test.js` (extend) OR `frontend/tests/e2e/admin-panel.spec.js` (extend)

The HTTP shape is best covered by an e2e test since the endpoint is HTTP-flavored.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/e2e/admin-panel.spec.js` (inside its existing `test.describe` or as a new `test.describe`):

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: both new tests fail. The PUT test fails with `400 Unknown setting key`; the GET test fails because `allow_user_registration` is not in the response object.

- [ ] **Step 3: Update `KNOWN_SETTINGS` and `readAll` defaults**

Modify `frontend/server/api/system-settings/index.js`:

Replace:

```js
const KNOWN_SETTINGS = new Set([
  'allow_pin',
  'auto_approve_new_users'
]);
```

with:

```js
const KNOWN_SETTINGS = new Set([
  'allow_pin',
  'auto_approve_new_users',
  'allow_user_registration'
]);
```

Replace:

```js
  if (!('allow_pin' in map)) map.allow_pin = 'true';
  if (!('auto_approve_new_users' in map)) map.auto_approve_new_users = 'false';
  return map;
```

with:

```js
  if (!('allow_pin' in map)) map.allow_pin = 'true';
  if (!('auto_approve_new_users' in map)) map.auto_approve_new_users = 'false';
  if (!('allow_user_registration' in map)) map.allow_user_registration = 'true';
  return map;
```

- [ ] **Step 4: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: both new tests pass; existing system-settings tests still green.

- [ ] **Step 5: Commit**

```
git add frontend/server/api/system-settings/index.js \
        frontend/tests/e2e/admin-panel.spec.js
git commit -m "feat(system-settings): whitelist allow_user_registration

Extends the system-settings whitelist and readAll defaults so the new
allow_user_registration key is readable by anonymous callers (the login
screen needs it to decide whether to render the New User tile) and
writable by admins via PUT."
```

---

## Task 3: Gate `POST /api/users` on `allow_user_registration`

**Files:**
- Modify: `frontend/server/api/users/index.js`
- Test: `frontend/tests/e2e/registration-lock.spec.js` (new file)

This is the security-critical step. The unit-level seam doesn't exist (the handler is a single h3 function); cover it with e2e.

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/e2e/registration-lock.spec.js`:

```js
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
    // Toggle auto_approve_new_users off explicitly. (Default is already false
    // but this asserts the admin-bypass is independent of that setting.)
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
    // Set up: enable registration, sign up a normal user, log them in,
    // then disable registration.
    await setRegistration(true);
    const setupCtx = await freshContext();
    const sig = await setupCtx.post('/api/users', {
      data: { name: `pleb-${Date.now()}`, password: 'pw12345!' }
    });
    const pleb = await sig.json();
    await setupCtx.dispose();

    // Activate pleb as admin so login works under default strict-approval.
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the four "blocked" / "admin-created" tests fail because POST /api/users today is unconditionally public and (a) accepts anon signups regardless of the setting, (b) honors `auto_approve_new_users`, (c) defaults `isAdmin=0` already so the body.isAdmin test may already pass; we still want it as a regression.

- [ ] **Step 3: Implement the gate in `POST /api/users`**

Modify `frontend/server/api/users/index.js`. In the POST branch, immediately after `try {`:

Replace the start of the POST handler:

```js
  if (method === 'POST') {
    try {
      const body = await readBody(event) || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
```

with:

```js
  if (method === 'POST') {
    try {
      const db = getDb();

      // Registration gate. Read the setting and the caller's session up
      // front. We do NOT use requireAuth() here because we want to allow
      // the anonymous signup path through when the setting is true; we
      // also do not want a deactivated session-cookie holder to be
      // treated the same as an anonymous caller.
      const allowRegRow = db
        .prepare("SELECT value FROM system_settings WHERE key = 'allow_user_registration'")
        .get();
      const allowRegistration = (allowRegRow?.value ?? 'true') === 'true';

      const sessionUser = event.context.user || null;
      const isAdminCaller = !!(sessionUser && sessionUser.is_active && sessionUser.isAdmin);

      if (!allowRegistration && !isAdminCaller) {
        return createError({
          statusCode: 403,
          statusMessage: 'Registration is disabled on this instance'
        });
      }

      const body = await readBody(event) || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
```

Then **further down in the same POST branch**, replace the auto-approve lookup:

```js
      const autoApproveRow = db
        .prepare("SELECT value FROM system_settings WHERE key = 'auto_approve_new_users'")
        .get();
      const autoApprove = (autoApproveRow?.value ?? 'false') === 'true';
      const isActive = autoApprove ? 1 : 0;
```

with (admin-create bypasses auto-approve):

```js
      // Admin-create is an explicit, knowing action — it bypasses the
      // global auto-approve setting and lands the user as is_active=1.
      // Anonymous self-signup honors the setting as before.
      let isActive;
      if (isAdminCaller) {
        isActive = 1;
      } else {
        const autoApproveRow = db
          .prepare("SELECT value FROM system_settings WHERE key = 'auto_approve_new_users'")
          .get();
        const autoApprove = (autoApproveRow?.value ?? 'false') === 'true';
        isActive = autoApprove ? 1 : 0;
      }
```

Also remove the now-redundant inner `const db = getDb();` further down in the same handler (the one before the existing `allowPinRow` lookup) — the variable is now declared at the top.

(Body.isAdmin is already silently ignored on POST in the existing handler — the INSERT hardcodes `0`. The test that asserts `isAdmin=0` is a regression check, not a new behavior.)

- [ ] **Step 4: Run the tests to verify they pass**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: all six new tests pass; existing user-create / system-settings tests still green.

- [ ] **Step 5: Commit**

```
git add frontend/server/api/users/index.js \
        frontend/tests/e2e/registration-lock.spec.js
git commit -m "feat(users): gate POST /api/users on allow_user_registration

Anonymous signups return 403 when allow_user_registration='false'.
Admin-session callers bypass the gate and additionally bypass
auto_approve_new_users (admin-created users land as is_active=1).
Body.isAdmin is still ignored — promotion remains a separate admin flow."
```

---

## Task 4: Login screen — hide "New User" tile when registration disabled

**Files:**
- Modify: `frontend/composables/useUserManagement.js`
- Modify: `frontend/pages/index.vue`
- Test: `frontend/tests/e2e/registration-lock.spec.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/e2e/registration-lock.spec.js`:

```js
test.describe('Login screen — New User tile', () => {
  test.afterEach(async () => {
    await setRegistration(true);
  });

  test('tile is visible when registration allowed', async ({ page }) => {
    await setRegistration(true);
    await page.goto('/');
    await expect(page.getByText('New User')).toBeVisible();
  });

  test('tile is hidden when registration disabled', async ({ page }) => {
    await setRegistration(false);
    await page.goto('/');
    // The "New User" label is the only place that string appears on the
    // login screen; the tile being hidden makes it absent from the DOM.
    await expect(page.getByText('New User')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the "tile is hidden" test fails — today the tile is unconditionally rendered.

- [ ] **Step 3: Surface `allow_user_registration` from the composable**

Modify `frontend/composables/useUserManagement.js`. Replace the existing `systemSettings` ref:

```js
  const systemSettings = ref({ allow_pin: true, auto_approve_new_users: false });
```

with:

```js
  const systemSettings = ref({ allow_pin: true, auto_approve_new_users: false, allow_user_registration: true });
```

Replace the body of `fetchSystemSettings`:

```js
      systemSettings.value = {
        allow_pin: (data.allow_pin ?? 'true') === 'true',
        auto_approve_new_users: (data.auto_approve_new_users ?? 'false') === 'true'
      };
```

with:

```js
      systemSettings.value = {
        allow_pin: (data.allow_pin ?? 'true') === 'true',
        auto_approve_new_users: (data.auto_approve_new_users ?? 'false') === 'true',
        allow_user_registration: (data.allow_user_registration ?? 'true') === 'true'
      };
```

(The `systemSettings` ref is already returned from the composable — no changes needed to the return block.)

- [ ] **Step 4: Hide the "New User" tile in `pages/index.vue`**

Modify `frontend/pages/index.vue` around line 80. Wrap the existing "New User Button" div in a `v-if`:

Replace:

```vue
        <!-- New User Button -->
        <div 
          class="bg-gray-800 rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-gray-700"
          @click="openCreateUserModal"
        >
          <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-3xl mb-2">
            +
          </div>
          <span class="text-white text-center">New User</span>
        </div>
```

with:

```vue
        <!-- New User Button — hidden when self-registration is disabled. -->
        <div
          v-if="systemSettings.allow_user_registration"
          class="bg-gray-800 rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-gray-700"
          @click="openCreateUserModal"
        >
          <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-3xl mb-2">
            +
          </div>
          <span class="text-white text-center">New User</span>
        </div>
```

(The `systemSettings` ref is already destructured from `useUserManagement` at the top of the page — confirm by grepping `systemSettings` in `pages/index.vue` and adding it to the destructure block if missing.)

- [ ] **Step 5: Run the tests to verify they pass**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: both "Login screen" tests pass; existing login/auth e2e suites still green.

- [ ] **Step 6: Commit**

```
git add frontend/composables/useUserManagement.js \
        frontend/pages/index.vue \
        frontend/tests/e2e/registration-lock.spec.js
git commit -m "feat(login): hide New User tile when registration disabled

Surfaces allow_user_registration through the existing systemSettings
ref in useUserManagement. Wraps the New User tile in v-if so a locked
instance shows only the existing-user picker. Server still owns the gate."
```

---

## Task 5: AdminPanel — "Create User" modal

**Files:**
- Modify: `frontend/components/AdminPanel.vue`
- Test: `frontend/tests/e2e/registration-lock.spec.js` (extend)

The modal mirrors the existing signup modal in `pages/index.vue` — name + avatar + auth-mode toggle (password / PIN / both) — with `allow_pin=false` hiding the PIN tab. There is no admin checkbox and no active checkbox: the server forces `isAdmin=0`/`is_active=1`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/e2e/registration-lock.spec.js`:

```js
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
```

(If `user-menu-trigger` is not the actual data-testid on the existing dropdown, adjust to whatever the existing admin-panel.spec.js uses to open the panel — grep `admin-panel` in the e2e folder for the canonical selector.)

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: fails — `getByTestId('admin-create-user')` cannot find the button.

- [ ] **Step 3: Add the "Create User" button to the Users tab**

Modify `frontend/components/AdminPanel.vue`. In the Users tab toolbar (the `<div class="flex items-center gap-2">` that holds the "Pending only" filter, around line 35), append a new button on the right:

Replace:

```vue
        <div class="flex items-center gap-2">
          <button
            data-testid="filter-pending"
            @click="filterPending = !filterPending"
            ...
          >Pending only</button>
          <span v-if="filterPending" class="text-xs text-gray-400">
            Showing only inactive accounts.
          </span>
        </div>
```

with:

```vue
        <div class="flex items-center gap-2">
          <button
            data-testid="filter-pending"
            @click="filterPending = !filterPending"
            :class="[
              'px-3 py-1 text-xs rounded border',
              filterPending
                ? 'bg-orange-700 border-orange-600 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
            ]"
          >Pending only</button>
          <span v-if="filterPending" class="text-xs text-gray-400">
            Showing only inactive accounts.
          </span>
          <div class="flex-1"></div>
          <button
            data-testid="admin-create-user"
            class="px-3 py-1 text-xs rounded bg-blue-700 text-white hover:bg-blue-600"
            @click="openCreateUser"
          >+ Create User</button>
        </div>
```

- [ ] **Step 4: Add the modal markup**

In the same file, just after the existing "Sessions drilldown" / "Kick confirmation" / "Delete confirmation" modals (i.e. inside the same outer `<div v-if="show">` block, before its closing `</div>`), append:

```vue
    <!-- Admin Create User -->
    <div
      v-if="showCreateUser"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
      data-testid="admin-create-user-modal"
      @click.self="onCreateUserBackdrop"
    >
      <div class="bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-white">Create user</h3>
          <button
            @click="closeCreateUser"
            class="text-gray-400 hover:text-white"
            aria-label="Close"
            :disabled="createSaving"
          >×</button>
        </div>

        <form @submit.prevent="submitCreateUser" class="flex flex-col gap-3">
          <label class="block">
            <span class="block text-sm font-medium text-gray-300 mb-1">Name</span>
            <input
              v-model="createForm.name"
              data-testid="admin-create-name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-white"
            />
          </label>

          <div v-if="createSettings.allow_pin" class="flex justify-center">
            <div class="inline-flex bg-gray-700 rounded-full p-1">
              <button
                type="button"
                data-testid="admin-create-mode-password"
                class="px-3 py-1 rounded-full text-sm"
                :class="createForm.mode === 'password' ? 'bg-blue-600 text-white' : 'text-gray-300'"
                @click="createForm.mode = 'password'"
              >Password</button>
              <button
                type="button"
                data-testid="admin-create-mode-pin"
                class="px-3 py-1 rounded-full text-sm"
                :class="createForm.mode === 'pin' ? 'bg-blue-600 text-white' : 'text-gray-300'"
                @click="createForm.mode = 'pin'"
              >PIN</button>
              <button
                type="button"
                data-testid="admin-create-mode-both"
                class="px-3 py-1 rounded-full text-sm"
                :class="createForm.mode === 'both' ? 'bg-blue-600 text-white' : 'text-gray-300'"
                @click="createForm.mode = 'both'"
              >Both</button>
            </div>
          </div>

          <label v-if="createForm.mode === 'password' || createForm.mode === 'both'" class="block">
            <span class="block text-sm font-medium text-gray-300 mb-1">Password</span>
            <input
              v-model="createForm.password"
              data-testid="admin-create-password"
              type="password"
              autocomplete="new-password"
              class="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-white"
            />
          </label>

          <label v-if="createSettings.allow_pin && (createForm.mode === 'pin' || createForm.mode === 'both')" class="block">
            <span class="block text-sm font-medium text-gray-300 mb-1">PIN (4 digits)</span>
            <input
              v-model="createForm.pin"
              data-testid="admin-create-pin"
              type="text"
              inputmode="numeric"
              pattern="\d{4}"
              maxlength="4"
              class="w-full px-3 py-2 border border-gray-600 rounded bg-gray-700 text-white"
            />
          </label>

          <p v-if="createError" class="text-red-400 text-sm" data-testid="admin-create-error">{{ createError }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="px-3 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-600"
              :disabled="createSaving"
              @click="closeCreateUser"
            >Cancel</button>
            <button
              type="submit"
              data-testid="admin-create-submit"
              class="px-3 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              :disabled="createSaving"
            >{{ createSaving ? 'Creating…' : 'Create' }}</button>
          </div>
        </form>
      </div>
    </div>
```

- [ ] **Step 5: Wire the script-side state and handlers**

In the same file, in the `<script setup>` block (after the existing `kickTarget` / `deleteTarget` declarations around line 354), add:

```js
const showCreateUser = ref(false);
const createForm = ref({ name: '', password: '', pin: '', mode: 'password' });
const createSettings = ref({ allow_pin: true });
const createSaving = ref(false);
const createError = ref('');

async function openCreateUser() {
  createForm.value = { name: '', password: '', pin: '', mode: 'password' };
  createError.value = '';
  // Pull a fresh allow_pin so the PIN tab matches current policy.
  try {
    const r = await fetch('/api/system-settings');
    if (r.ok) {
      const body = await r.json();
      createSettings.value = { allow_pin: (body.allow_pin ?? 'true') === 'true' };
      // If PINs are disabled, force the mode to password.
      if (!createSettings.value.allow_pin) createForm.value.mode = 'password';
    }
  } catch { /* default stays allow_pin=true */ }
  showCreateUser.value = true;
}

function closeCreateUser() {
  if (createSaving.value) return;
  showCreateUser.value = false;
}

function onCreateUserBackdrop() {
  // In-flight save guard mirrors the rest of the modals in this app.
  if (createSaving.value) return;
  showCreateUser.value = false;
}

async function submitCreateUser() {
  createError.value = '';
  const name = createForm.value.name.trim();
  if (!name) { createError.value = 'Name is required'; return; }

  const wantsPassword = createForm.value.mode === 'password' || createForm.value.mode === 'both';
  const wantsPin = createSettings.value.allow_pin
    && (createForm.value.mode === 'pin' || createForm.value.mode === 'both');

  const password = wantsPassword ? createForm.value.password : '';
  const pin = wantsPin ? createForm.value.pin : '';

  if (!password && !pin) {
    createError.value = 'Set a password, a PIN, or both.';
    return;
  }
  if (pin && !/^\d{4}$/.test(pin)) {
    createError.value = 'PIN must be exactly 4 digits.';
    return;
  }

  createSaving.value = true;
  try {
    const r = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        password: password || null,
        pin: pin || null
      })
    });
    if (!r.ok) {
      let msg = `Create failed (${r.status})`;
      try { msg = (await r.json())?.statusMessage || msg; } catch {}
      createError.value = msg;
      return;
    }
    showCreateUser.value = false;
    await loadUsers();
  } catch (err) {
    createError.value = err.message || 'Create failed';
  } finally {
    createSaving.value = false;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the AdminPanel Create User test passes; existing admin-panel tests still green.

- [ ] **Step 7: Commit**

```
git add frontend/components/AdminPanel.vue \
        frontend/tests/e2e/registration-lock.spec.js
git commit -m "feat(admin): Create User modal in AdminPanel Users tab

New admin-only modal that POSTs /api/users with the admin's session, so
account creation works even when self-registration is locked. Mirrors
the signup modal's auth-mode UI; PIN tab respects allow_pin. Server
forces isAdmin=0 / is_active=1 — promotion stays a separate per-row
admin click."
```

---

## Task 6: AdminPanel — "Allow user self-registration" toggle

**Files:**
- Modify: `frontend/components/AdminPanel.vue`
- Test: `frontend/tests/e2e/registration-lock.spec.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `frontend/tests/e2e/registration-lock.spec.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: fails — `getByTestId('settings-allow-registration')` does not exist yet.

- [ ] **Step 3: Add the toggle row, state, and save call**

Modify `frontend/components/AdminPanel.vue`.

In the settings tab template (after the `auto_approve_new_users` `<label>` around line 197), add a third row:

```vue
          <label class="flex items-start gap-3">
            <input
              type="checkbox"
              v-model="settings.allow_user_registration"
              data-testid="settings-allow-registration"
              class="mt-1"
            />
            <span>
              <span class="block font-medium">Allow user self-registration</span>
              <span class="block text-xs text-gray-400">
                When off, the "New User" tile on the login screen is hidden and
                public POST /api/users is refused. Admins can still create
                accounts from the Users tab.
              </span>
            </span>
          </label>
```

In the `<script setup>` block, replace:

```js
const settings = ref({ allow_pin: true, auto_approve_new_users: false });
```

with:

```js
const settings = ref({ allow_pin: true, auto_approve_new_users: false, allow_user_registration: true });
```

In the `loadSettings` (or whatever the existing load function is — look for `coerceBool`-using block around line 514), extend the assignment from:

```js
    settings.value = {
      allow_pin: coerceBool(body.allow_pin),
      auto_approve_new_users: coerceBool(body.auto_approve_new_users)
    };
```

to:

```js
    settings.value = {
      allow_pin: coerceBool(body.allow_pin),
      auto_approve_new_users: coerceBool(body.auto_approve_new_users),
      allow_user_registration: coerceBool(body.allow_user_registration)
    };
```

In the `saveSettings` (or equivalent — look for the `putSetting` calls around line 552), append a third PUT after the existing two:

```js
    await putSetting('allow_pin', settings.value.allow_pin);
    await putSetting('auto_approve_new_users', settings.value.auto_approve_new_users);
    await putSetting('allow_user_registration', settings.value.allow_user_registration);
```

- [ ] **Step 4: Run the test to verify it passes**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the new settings-tab test passes; existing settings tests still green.

- [ ] **Step 5: Commit**

```
git add frontend/components/AdminPanel.vue \
        frontend/tests/e2e/registration-lock.spec.js
git commit -m "feat(admin): allow_user_registration toggle in Settings tab

Third checkbox alongside allow_pin and auto_approve_new_users. Save
button persists all three together via the existing PUT /api/system-settings
loop."
```

---

## Task 7: Documentation — README + docker-compose.example.yml

**Files:**
- Modify: `README.md`
- Modify: `docker-compose.example.yml`

No test step here — docs are read by humans.

- [ ] **Step 1: Add the env var to the README**

Modify `README.md`. Find the env vars table (search for `ADMIN_NAME` to land on it) and add a row for `ALLOW_USER_REGISTRATION` immediately after the existing `REQUIRE_ADMIN_APPROVAL` row, with the same shape:

```
| `ALLOW_USER_REGISTRATION` | `true` | When `false`, the public "New User" tile on the login screen is hidden and self-signup is refused. Admins can still create accounts from the Admin Panel. Runtime-toggleable from Admin Panel → Settings after first boot. |
```

If the table format in the README differs, match the existing rows exactly.

- [ ] **Step 2: Add a commented example to `docker-compose.example.yml`**

Modify `docker-compose.example.yml`. Find the `environment:` block and add a commented line below the existing `REQUIRE_ADMIN_APPROVAL` (or below `ADMIN_PASSWORD` if `REQUIRE_ADMIN_APPROVAL` is not in the example):

```yaml
      # Set to "false" to lock self-signup; admins create accounts via
      # the Admin Panel. Toggleable at runtime from Admin Panel → Settings.
      # - ALLOW_USER_REGISTRATION=false
```

- [ ] **Step 3: Commit**

```
git add README.md docker-compose.example.yml
git commit -m "docs: ALLOW_USER_REGISTRATION env var

README env table + commented example in docker-compose.example.yml.
First-boot seed only; admin panel owns the value after that."
```

---

## Task 8: Codex review pass

**Files:**
- Create: `notes/registration-lock-codex-prompt.md`

- [ ] **Step 1: Draft the Codex review prompt**

Create `notes/registration-lock-codex-prompt.md`:

```markdown
# Codex review — registration lock + admin create-user

## Context

Branch `feat/registration-lock` adds a `system_settings.allow_user_registration` toggle, env-seeded by `ALLOW_USER_REGISTRATION` on first boot, that gates `POST /api/users` to admin-session callers when set to `false`. Admins can also create users from a new modal in the AdminPanel that bypasses both the registration gate and the `auto_approve_new_users` setting (admin-created users land as `is_active=1, isAdmin=0`). Login screen hides the "New User" tile when the setting is `false`.

Spec: notes/registration-lock-design.md.

## Review focus (severity gating: BLOCKER / HIGH / MEDIUM / LOW)

Please flag findings with severity. Address BLOCKER + HIGH inline; MEDIUM if cheap; LOW noted in commit body.

1. **Registration gate bypass.** Any path through `frontend/server/api/users/index.js` POST where the gate can be skipped — malformed body, missing/invalid session, race with the setting being toggled mid-request, etc.

2. **Migration idempotency.** `frontend/server/migrations/003_allow_user_registration.js` uses `INSERT OR IGNORE`. Confirm: re-running on a DB that already has the row is a no-op; an admin-edited value is not clobbered; an unknown env value falls back to `'true'` rather than writing garbage.

3. **`event.context.user` shape.** The gate reads `event.context.user.is_active` and `event.context.user.isAdmin`. Confirm the session middleware always populates these fields (i.e. SELECT in `frontend/server/middleware/session.js` includes them). A null/undefined value here would be dangerous.

4. **Admin-create body smuggling.** The admin-create path uses the same handler as anonymous signup. Confirm:
   - `body.isAdmin` is ignored (insertion hardcodes `0`).
   - `body.is_active` is not honored — the handler computes `isActive` itself.
   - Anything else from the body (e.g. `created_at`) cannot be smuggled.

5. **AdminPanel Create modal.** `frontend/components/AdminPanel.vue` — the in-flight save guard, the backdrop dismiss, the PIN tab visibility under `allow_pin=false`. Any obvious UX foot-gun?

6. **System-settings PUT.** Is there any way for `admin-edited allow_user_registration='garbage'` to land via the PUT endpoint and then break the gate? (Should be coerced to `'true'`/`'false'` — confirm.)

7. **Test coverage gaps.** `frontend/tests/e2e/registration-lock.spec.js` — failure modes I missed?

## Out of scope

Anything not in this PR. Do not propose unrelated refactors.
```

- [ ] **Step 2: Run Codex via the project's Bash invocation**

```
node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < notes/registration-lock-codex-prompt.md
```

Save the response to your local notes (or chat); identify each finding's severity.

- [ ] **Step 3: Address findings**

For each BLOCKER / HIGH / reasonable MEDIUM:
- Write a failing test that captures the bug if applicable.
- Apply the fix.
- Re-run the suite via Docker.
- Commit per fix with a descriptive message (`fix(<scope>): <what>`).

Document any LOW deferrals at the end of the eventual PR description.

- [ ] **Step 4: Commit the prompt**

```
git add notes/registration-lock-codex-prompt.md
git commit -m "docs: codex review prompt for registration-lock

Captures the focus areas, severity gating, and out-of-scope notes for
the second-pair-of-eyes pass before opening the PR."
```

---

## Task 9: Final verification + open the PR

- [ ] **Step 1: Full test pass on a clean DB**

```
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full vitest + Playwright suites green. Note the totals (should be `>75 passed (vitest)` and `>82 passed (e2e)` since this PR adds tests).

- [ ] **Step 2: Manual smoke against the manual-test stack**

Per `notes/handover.md`:

```
docker compose -f docker-compose.manual.yml down
rm -rf manual-test/data/database/*
docker compose -f docker-compose.manual.yml up --build -d
```

Visit `http://localhost:3001`. Walk through:
- Default state: "New User" tile present; sign up a user; verify it works.
- Log in as admin → AdminPanel → Settings → uncheck "Allow user self-registration" → Save.
- Log out; verify "New User" tile is gone.
- Log back in as admin → AdminPanel → Users → "Create User" → fill form → submit; verify the new user appears as Active + User.
- Log out; the new user logs in; verify they reach `/courses`.
- Log back in as admin → re-enable registration; the tile reappears on the login screen after a page reload.

If anything misbehaves: capture in the PR description as a follow-up, do not silently move on.

- [ ] **Step 3: Push and open the PR**

```
git push -u origin feat/registration-lock
gh pr create --title "feat: ALLOW_USER_REGISTRATION toggle + admin Create-User" --body "$(cat <<'EOF'
## Summary
- Adds `ALLOW_USER_REGISTRATION` env var (seeds first-boot default) and `system_settings.allow_user_registration` (admin-toggleable at runtime).
- When `false`: public `POST /api/users` returns 403; the login screen's "New User" tile is hidden.
- New "Create User" modal in AdminPanel → Users that bypasses both the gate and `auto_approve_new_users` (admin-created users are always `is_active=1, isAdmin=0`).
- New checkbox row in AdminPanel → Settings.

## Spec
notes/registration-lock-design.md

## Codex review
notes/registration-lock-codex-prompt.md and findings addressed (see commits).

## Test plan
- [ ] Vitest + Playwright suites green in Docker.
- [ ] Manual: lock registration, "New User" tile disappears.
- [ ] Manual: admin creates user from panel; user logs in; lands on /courses.
- [ ] Manual: admin re-enables registration; tile reappears after reload.
EOF
)"
```

---

## Self-review (against [notes/registration-lock-design.md](notes/registration-lock-design.md))

- **Migration `003`** — Task 1 ✓
- **Env-driven seeding with `'true'` fallback** — Task 1, Step 3 ✓
- **`/api/system-settings` whitelist + readAll default** — Task 2 ✓
- **`POST /api/users` gate (anon → 403; admin → bypass)** — Task 3 ✓
- **Admin-create bypasses `auto_approve_new_users` (always `is_active=1`)** — Task 3, Step 3 ✓
- **`body.isAdmin` ignored on POST** — already-existing behavior, regression-tested in Task 3 ✓
- **PIN policy unchanged (allow_pin=false → refuse PIN-only signup)** — left intact in Task 3, exercised by Task 5 modal logic ✓
- **Login screen `v-if` on the New User tile** — Task 4 ✓
- **AdminPanel Create User button + modal** — Task 5 ✓
- **AdminPanel Settings checkbox** — Task 6 ✓
- **README + docker-compose.example.yml** — Task 7 ✓
- **Codex review** — Task 8 ✓
- **Definition-of-done checklist (final pass + manual smoke + PR)** — Task 9 ✓

No placeholders detected. Type/method names consistent across tasks (`createForm`, `showCreateUser`, `submitCreateUser`, `loadUsers` match each other and the existing AdminPanel code). All tests run via the project's Docker invocation. All commits use the project's per-phase commit style without Claude attribution.
