# Registration Lock + Admin Create-User — design

Slice 1 of the post-auth-hardening round. Smallest, most self-contained feature on the wishlist.

## Goal

Let an operator turn off public self-signup so the only path to a new account is an admin creating one from the admin panel. Toggle must be runtime — no container restart needed.

## Why

Today, `POST /api/users` is the only mutating user endpoint without an authz check (every other write is gated; see audit in chat). It's intentionally public so the signup form on the login screen works. But operators on shared family devices, or anyone who's nervous about who can hit the LAN, want a way to lock it down without losing the ability to add accounts at all.

This is the same shape as the `allow_pin` and `auto_approve_new_users` toggles already in `system_settings`: env var seeds the default at first boot, admin UI wins after that.

## Scope (locked)

- New env var `ALLOW_USER_REGISTRATION=true|false`. Seed only — sets `system_settings.allow_user_registration` on first boot. Subsequent boots ignore the env, admin UI is the source of truth.
- Default when env unset: `true` (backwards-compatible — existing installs see no behavior change on upgrade).
- New `system_settings` row `allow_user_registration` (string `'true'`/`'false'`, same shape as the existing two settings).
- Server-side gate on `POST /api/users`: when `false`, require the caller's session to be an admin or 403.
- Admin-created users:
  - Always `isAdmin=0` (regular user). Promotion is the existing per-row admin toggle.
  - Always `is_active=1`. Admin-create is an explicit knowing action; the global `auto_approve_new_users` setting does not apply.
  - Same credential rules as self-signup: at least one of password / PIN; PIN must be 4 digits; PIN refused if `allow_pin=false`.
- Login screen UI: when `allow_user_registration=false`, hide the "New User" tile entirely. Same pattern as the PIN field disappearing under `allow_pin=false`.
- Admin Panel UI:
  - New "Create User" button + modal on the Users tab.
  - New checkbox row on the System Settings tab, alongside the existing two toggles.

## Out of scope

- Renaming the env var or aligning naming with `REQUIRE_ADMIN_APPROVAL` — keep `ALLOW_USER_REGISTRATION` as the user requested.
- Letting admins create other admins from the create modal. The existing per-row promote button covers it.
- Letting admins set `is_active=0` on creation. Existing per-row deactivate covers it.
- Audit logging of admin-create events. Future round if anyone asks.

## Server design

### Migration `frontend/server/migrations/003_allow_user_registration.js`

- Insert `('allow_user_registration', <value>, CURRENT_TIMESTAMP)` into `system_settings` if the row does not already exist.
- Value taken from `process.env.ALLOW_USER_REGISTRATION` if it is exactly `'true'` or `'false'`; else default `'true'`.
- Idempotent: `INSERT ... WHERE NOT EXISTS` (or guard via SELECT first), so re-running the migration is a no-op.
- Append to `frontend/server/migrations/index.js` manifest in numeric order.

### `/api/system-settings/index.js`

- Add `'allow_user_registration'` to the `KNOWN_SETTINGS` whitelist.
- Add `if (!('allow_user_registration' in map)) map.allow_user_registration = 'true';` in `readAll()` for defense-in-depth (matches existing pattern for the other two keys).
- Existing PUT path — admin-gated, boolean coercion — already handles the new key without further changes.

### `/api/users/index.js` POST gate

The handler currently has no authz call. Add at the top of the POST branch, before reading body:

```
const allow = readSystemSetting(db, 'allow_user_registration', 'true') === 'true';
let caller = null;
try { caller = requireAuth(event); } catch { /* anon — fall through */ }
if (!allow && !caller?.isAdmin) {
  return createError({ statusCode: 403, statusMessage: 'Registration is disabled on this instance' });
}
```

(Helper name placeholder — actual code will inline the prepared-statement read; can extract to a util in `system-settings.js` if reuse appears.)

When the caller is an admin (registration locked or not), the handler:
- Skips the `auto_approve_new_users` lookup; admin-created rows always go in with `is_active=1`.
- Continues to ignore `body.isAdmin` (admin-created is always normal-user; promotion is a separate flow).

When the caller is anonymous and registration is allowed, behavior is unchanged from today.

### What does NOT change

- The PIN policy gate (`allow_pin=false` ⇒ refuse PIN-only signup) stays as-is and applies to admin-create too.
- The 4-digit PIN regex stays as-is.
- The duplicate-name 409 stays as-is.
- The credential-floor (must have password OR PIN) stays as-is.
- `auto_approve_new_users` behavior for self-signup paths stays as-is.

## Frontend design

### `composables/useUserManagement.js`

- The composable already fetches `/api/system-settings` to read `allow_pin`. Extend the same fetch to surface `allow_user_registration` as a reactive ref.
- Expose it from the composable's return so `pages/index.vue` can read it.

### `pages/index.vue`

- Wrap the "New User" tile (line 80 region in the file) with `v-if="allowUserRegistration"`.
- No change to the modal itself — when the tile is hidden, the modal is unreachable.

### `components/AdminPanel.vue` — Users tab

- New "Create User" button placed near the top of the Users tab (next to or above the "Pending only" filter).
- Click opens a new modal with form fields:
  - Name (required)
  - Avatar (optional — same Beanhead component the signup modal uses)
  - Auth mode: password / PIN / both (same UI shape as signup modal)
  - Password input (when applicable)
  - PIN split-input (when applicable; hidden if `allow_pin=false`)
- Submit: `POST /api/users` with `{ name, password, pin, avatar }` (no `isAdmin`, no `is_active` — server defaults are correct).
- On success: close modal, refresh user list. On error: surface `statusMessage`.
- Backdrop dismiss + in-flight save guard, matching every other modal in the app.

### `components/AdminPanel.vue` — System Settings tab

- Add a third checkbox row `Allow user self-registration` alongside the existing `allow_pin` and `auto_approve_new_users` toggles.
- Same wiring: PUT `/api/system-settings` with `{ key: 'allow_user_registration', value: <boolean> }` on toggle.

## Tests

### Vitest (`frontend/tests/unit/`)

- `migration-003.test.js`: applies migration to in-memory DB; with `ALLOW_USER_REGISTRATION=false` env, the seeded value is `'false'`; with env unset, value is `'true'`; with env `'garbage'`, value is `'true'` (defensive default); re-running migration is a no-op.
- Extend existing `users-create.test.js` (or add `users-create-registration-lock.test.js`):
  - With `allow_user_registration='false'` and no session: 403.
  - With `allow_user_registration='false'` and admin session: 201 + new user is `is_active=1`, `isAdmin=0`.
  - With `allow_user_registration='false'` and non-admin session: 403.
  - With `allow_user_registration='true'` and no session: 201 (back to today's behavior).
  - With `allow_user_registration='false'`, admin session, body.isAdmin=1: created user still has `isAdmin=0` (server ignores).

### Playwright (`frontend/tests/e2e/`)

- `registration-lock.spec.js`:
  - Fresh install with `ALLOW_USER_REGISTRATION=false` env: login screen has no "New User" tile; admin logs in, opens AdminPanel → System Settings → toggle is unchecked.
  - Admin opens Users tab → "Create User" → fills form → new user appears in the list as `Active` and `User` (not Admin).
  - Log out, the new user logs in successfully.
  - Admin re-enables registration via the system-settings toggle. Without page reload, log out — "New User" tile reappears (or after a re-fetch on the login screen mount, which is the existing pattern for `allow_pin`).

## README + docker-compose.example.yml

- README env vars table: add `ALLOW_USER_REGISTRATION` row. Document: defaults to `true` (allowed); `false` to lock self-signup; runtime-toggleable from the admin panel after first boot.
- `docker-compose.example.yml`: add a commented `# - ALLOW_USER_REGISTRATION=false` example line so operators see the option exists.

## Codex review

`notes/registration-lock-codex-prompt.md` before commit. Focus areas:

- Authz bypass: any path where the POST /api/users gate can be skipped (malformed body, missing session middleware, etc).
- Migration idempotency on a DB that already has the key.
- Race between admin toggling registration off and an in-flight signup POST.
- Body-field smuggling in the admin-create path (e.g., `body.is_active=0` from an admin client — does the handler honor it or ignore it? The spec says ignore.).

Address BLOCKER + HIGH + reasonable MEDIUMs; document LOW deferrals in the commit body.

## Definition of done

- Migration applied; fresh and upgraded installs both end up with the new system-settings row.
- POST /api/users with registration disabled refuses non-admin callers; admin callers succeed and get a normal active user.
- Login screen "New User" tile is gated by the setting.
- AdminPanel has a working Create User modal and a working System Settings toggle.
- Vitest + Playwright suites pass in Docker.
- README + docker-compose.example.yml updated.
- Codex review attached to PR description; HIGHs addressed.
- One PR, one merge — slice ends here.
