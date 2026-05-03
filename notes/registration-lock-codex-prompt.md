# Codex review — registration lock + admin create-user

## Context

Branch `feat/registration-lock` adds a `system_settings.allow_user_registration` toggle, env-seeded by `ALLOW_USER_REGISTRATION` on first boot, that gates `POST /api/users` to admin-session callers when set to `false`. Admins can also create users from a new modal in the AdminPanel that bypasses both the registration gate and the `auto_approve_new_users` setting (admin-created users land as `is_active=1, isAdmin=0`). Login screen hides the "New User" tile when the setting is `false`.

Spec: `notes/registration-lock-design.md`. Plan: `notes/registration-lock-plan.md`.

Commits on this branch (since `origin/main`):
- `3417cca` feat(migrations): seed allow_user_registration system setting
- `b914539` feat(system-settings): whitelist allow_user_registration
- `41872a2` feat(users): gate POST /api/users on allow_user_registration
- `306ff65` test(users): regression test for deactivated-admin gate bypass
- `79f2414` feat(login): hide New User tile when registration disabled
- `54ced81` test(login): wait for SPA hydration before asserting tile absence
- `8ffd45d` feat(admin): Create User modal in AdminPanel Users tab
- `f18d151` feat(admin): allow_user_registration toggle in Settings tab
- `67c8e2a` docs: ALLOW_USER_REGISTRATION env var

## Review focus (severity gating: BLOCKER / HIGH / MEDIUM / LOW)

Please flag findings with severity. The orchestrator will address BLOCKER + HIGH inline; MEDIUM if cheap; LOW noted in commit body.

1. **Registration gate bypass.** Any path through `frontend/server/api/users/index.js` POST where the gate can be skipped — malformed body, missing/invalid session, race with the setting being toggled mid-request, etc. The gate at the top of the POST branch reads `event.context.user` directly (NOT via `requireAuth()`) so anonymous calls fall through when registration is allowed. Confirm there's no edge case where this is wrong.

2. **Migration idempotency.** `frontend/server/migrations/003_allow_user_registration.js` uses `INSERT OR IGNORE` and reads `process.env.ALLOW_USER_REGISTRATION` only when the row doesn't exist. Confirm: re-running on a DB that already has the row is a no-op; an admin-edited value is not clobbered; an unknown env value falls back to `'true'` rather than writing garbage.

3. **`event.context.user` shape.** The gate reads `event.context.user.is_active` and `event.context.user.isAdmin`. Confirm the session middleware always populates these fields (i.e. the SELECT in `frontend/server/middleware/session.js` and `frontend/server/utils/sessions.js` includes them). A null/undefined value here would be dangerous (would degrade to "always not admin" which is the safe direction, but worth verifying).

4. **Admin-create body smuggling.** The admin-create path uses the same handler as anonymous signup. Confirm:
   - `body.isAdmin` is ignored (insertion hardcodes `0`).
   - `body.is_active` is not honored — the handler computes `isActive` itself.
   - Anything else from the body (e.g. `created_at`, `password_hash`, etc.) cannot be smuggled into columns we don't intend.

5. **AdminPanel Create modal.** `frontend/components/AdminPanel.vue` — the in-flight save guard, the backdrop dismiss, the PIN tab visibility under `allow_pin=false`. Any obvious UX foot-gun? Any reactivity issue with the `createForm` ref-of-object? Any double-submit risk?

6. **System-settings PUT.** Is there any way for `admin-edited allow_user_registration='garbage'` to land via the PUT endpoint and then break the gate? (Should be coerced to `'true'`/`'false'` — confirm at `frontend/server/api/system-settings/index.js`.)

7. **Test coverage gaps.** `frontend/tests/e2e/registration-lock.spec.js` — failure modes I missed? Specifically: server returns 400 (duplicate name) on admin-create — is the error display pipeline (`createError`, `data-testid="admin-create-error"`) covered end-to-end?

8. **PIN policy interactions.** Admin-create still respects `allow_pin=false` (cannot supply a PIN-only signup). Confirm by reading the POST handler — the `allow_pin` gate is downstream of the registration gate.

9. **Anything else** — security, race conditions, error-handling gaps, naming inconsistencies, dead code, performance landmines.

## Out of scope

Anything not in this PR. Do not propose unrelated refactors. Do not propose UI redesigns. Do not propose splitting AdminPanel.vue into smaller components (it's a known backlog item — out of scope for this PR).

## Format

Please report findings as a list, each with:
- **Severity:** BLOCKER / HIGH / MEDIUM / LOW
- **Title:** one line
- **Location:** file:line
- **Description:** what's wrong + why it matters
- **Suggested fix:** specific code or test change

If you find no issues at a given severity, say so explicitly.
