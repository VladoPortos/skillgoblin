# Handover — auth-hardening branch

**Branch:** `feat/auth-hardening` (worktree: `E:/skillgoblin/.claude/worktrees/wizardly-cohen-224f57`)
**Status:** Phases 0–3 done and tested. Phases 4–5 are open.
**Repo:** [VladoPortos/skillgoblin](https://github.com/VladoPortos/skillgoblin)

This doc is the cold-start brief for whoever picks the branch up next. Read it once, then `notes/process.md` for workflow rules and `notes/feature-wishlist.md` for the locked design decisions.

---

## Branch state

```
66f1223 Phase 3: upgrade flows, system-settings endpoint, allow_pin enforcement
4299278 Phase 2: cookie sessions, server-side authz, rate limiting, last-admin protection
fae35ab Phase 1: argon2id credentials, auth-hardening migration, first-run admin bootstrap
ac8c757 Phase 0: migration framework + test infrastructure + dead-code cleanup
9f9bb5e readme update     ← main starts here
```

**Tests:** 34 e2e + ~75 vitest unit tests, all green in the dockerized stack.
**PR:** Not opened yet. The plan was one consolidated PR at the end of all phases.

---

## What's done — Phases 0–3 in one paragraph each

**Phase 0 — foundations.** Migration framework with `migrations` bookkeeping table and a numbered manifest at `frontend/server/migrations/`. Vitest + Playwright wired up, all run inside `docker-compose.test.yml`. Dropped 4 dead/broken endpoints that were already on main (progress.js, favorites.js, users/[id].delete.js, placeholder PUT/DELETE branches in users/[id].js). [`notes/architecture-map.md`](architecture-map.md) §10 lists what was removed and why.

**Phase 1 — credentials + bootstrap.** Argon2id wrapper at `frontend/server/utils/credentials.js` with inline-on-read rehash for legacy plaintext rows. Migration `002_auth_hardening` drops `use_auth`, adds `is_active`, creates `user_sessions` and `system_settings` tables, seeds `auto_approve_new_users=false` and `allow_pin=true`. Nitro server plugin `frontend/server/plugins/bootstrap.js` refuses to start on a fresh install if `ADMIN_NAME`/`ADMIN_PASSWORD` env are missing.

**Phase 2 — sessions + authz.** Opaque base64url session tokens with sha256 storage in `user_sessions`. Server middleware `frontend/server/middleware/session.js` populates `event.context.user` per request (skips `/api/content/...` and static assets for perf). `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` helpers retrofit onto every mutating endpoint. In-memory rate limiter on `/api/users/auth` with exponential backoff. Last-admin-protected invariant in `lastAdminGuard.js` — refuses demote, deactivate, or delete that would leave zero active admins. Frontend rewired: `useSession` is cookie-based, `useTheme` and `useUserManagement` updated, dead `x-user-id` header dropped from courses/edit.

**Phase 3 — upgrade flows + UX.** New `system-settings` endpoint (GET public for the signup screen, PUT admin-only). New `bootstrap-credentials` endpoint for legacy no-creds users — sets credentials in place and issues a session. Auth response now includes `needsCredentialUpdate: 'pin_disabled' | null`. PIN authentication is rejected when admin set `allow_pin=false`, except as a one-time bridge for users with no password. Shared `SetCredentialsModal` Vue component handles both pre-login bootstrap and post-login upgrade. Profile editor (`UserManagement.vue`) cleaned up — dead `use_auth` references gone, "Remove auth" tab removed because auth is mandatory. Server-side credential floor on PUT — refuses any update that would leave a row with neither password nor PIN.

---

## What's left — Phases 4–5

### Phase 4 — admin panel UI

Backend authz exists. The admin UI to use it does not. Specifically the `/courses` page's existing admin dropdown opens `UserManagement.vue` which today only edits the *current* user. We need:

- A real users-list view for admins: show all users (name, role, active state, has_password / has_pin, created_at), with per-row actions:
  - Activate / deactivate (calls `PUT /api/users` with `is_active` — admin-only, last-admin-protected on the deactivate side)
  - Promote / demote (PUT with `isAdmin` — admin-only, last-admin-protected on the demote side)
  - Reset credentials (PUT with `password`/`pin` set by admin)
  - Kick all sessions (no endpoint yet; add one — `POST /api/users/[id]/kick-sessions` or pass `kickAllSessions: true` to PUT — that calls `deleteUserSessions(db, id)` from `frontend/server/utils/sessions.js`)
  - Delete (POST `/api/users/delete` already supports admin-deleting-other; respects last-admin protection)
- A system-settings panel (toggle `allow_pin` and `auto_approve_new_users`) — the `PUT /api/system-settings` endpoint exists; just needs a UI.
- An "active sessions" view (per-user `user_agent`, `last_seen_at`, `created_at`) — read directly from `user_sessions`. Endpoint to add: `GET /api/users/[id]/sessions`.
- A "pending users" tab (filter by `is_active=0`) — relevant when `auto_approve_new_users=false` (the default). Reuses the activate row action.

Tests: e2e for each admin action. Unit tests for any new endpoints.

Likely commit name: `Phase 4: admin panel`.

### Phase 5 — README + docs + small cleanup

- Update top-level `README.md`: new env vars (`ADMIN_NAME`, `ADMIN_PASSWORD`), the first-run-admin requirement (fail-fast), the migration story for upgraders, the security model (homelab-only, X-Forwarded-* trust assumes a real reverse proxy).
- Inline doc cleanup: any TODO/comment that points at a phase that's now done.
- Optional: a `docker-compose.example.yml` showing the recommended setup with env vars.

Likely commit name: `Phase 5: README and docs`.

### Then: open the PR

Per the user's preference, **one consolidated PR at the end** (not per-phase). Use `gh pr create` from this branch into `main`. PR description should reference the four phase commits and link `notes/feature-wishlist.md` + `notes/architecture-map.md`.

---

## How to work on this branch

### Workflow rules

`notes/process.md` is the source of truth. Quick recap:

- **Never commit to `main` directly.** All work on `feat/auth-hardening`.
- **Migrations are forward-only and numbered.** New schema change → add `frontend/server/migrations/003_<name>.js` and append to `index.js`.
- **Tests run in Docker, always.** `docker compose -f docker-compose.test.yml run --rm tests`. Build the app image with `--build` if you touched `Dockerfile.prod` or the lockfile.
- **Codex review per phase before commit.** Working invocation:
  ```bash
  node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < /tmp/<phase>-prompt.md
  ```
  The Skill / `/codex:rescue` slash-command path hangs in this environment — see [`feedback_codex.md`](../../C:/Users/vlado/.claude/projects/E--skillgoblin/memory/feedback_codex.md) in the user's memory.

### Running tests (the only verification path)

```bash
cd E:/skillgoblin/.claude/worktrees/wizardly-cohen-224f57
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

The first build pulls the Playwright image (~1.5 GB, one-time) and builds the app image. Subsequent runs are ~30 sec.

The compose file sets `ADMIN_NAME=root` / `ADMIN_PASSWORD=TestAdminPass!` for the app service so the bootstrap plugin can satisfy its fail-fast requirement. Don't change those without also updating `tests/e2e/auth.spec.js` and `tests/e2e/sessions.spec.js`.

### Lockfile changes

Bumping a dep needs the lockfile regenerated *inside Docker* (the host's Node 24 + better-sqlite3 native build is broken on this Windows machine):

```bash
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W)/frontend:/work" -w "//work" node:18-alpine \
  sh -c "npm install --package-lock-only --no-audit --no-fund"
```

### Codex setup
- Plugin at `C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/`
- Codex CLI at v0.125.0 — npm latest at handover time was 0.128.0; bumping is optional.
- Auth: already done. If `codex --version` says `unauthenticated`, run `codex login`.

---

## Known follow-ups (not blockers, deferred from earlier reviews)

These are real but small enough to defer past the PR. Each is documented in the relevant phase commit body.

| Item | Why deferred | Lives in |
|---|---|---|
| `X-Forwarded-Proto` and `X-Forwarded-For` are trusted unconditionally | Acceptable behind a real reverse proxy (the recommended deployment); not exploitable through normal use | `frontend/server/middleware/session.js`, `frontend/server/api/users/auth.js` |
| `touchSession` updates without a `changes` check | Race with logout/revoke briefly re-issues a cookie for an already-deleted row; next request clears it. Not a privilege escalation | `frontend/server/utils/sessions.js` |
| `/api/users/[id]` GET still leaks `isAdmin`, `is_active`, `has_password`, `has_pin` | The login picker needs these | `frontend/server/api/users/[id].js` |
| Migration runner uses raw `BEGIN`; nested transactions in future migrations would conflict | No migration uses nested transactions yet; swap to `db.transaction()` when needed | `frontend/server/utils/migrations.js` |
| `001_initial` thumbnail_data column ordering differs between fresh and upgraded installs | Harmless for named queries; only matters if `SELECT *` code is ever introduced | `frontend/server/migrations/001_initial.js` |
| `UserManagement.vue` doesn't yet show an encourage-both hint in the change/switch tabs | Phase 4 admin-panel polish | `frontend/components/UserManagement.vue` |
| Bootstrap-credentials success-path e2e is gap | Would need a fixture that inserts a legacy no-creds row, since signup refuses to create one. Unit-level coverage of the failure cases is in place | `frontend/tests/e2e/upgrade-flows.spec.js` |
| Rate limiter is per-process; cluster mode would have separate buckets | We don't run cluster mode; documented in the file | `frontend/server/utils/rate-limit.js` |

---

## Architectural cheat sheet

The full map is `notes/architecture-map.md`. The 30-second version after Phase 3:

- **Auth:** cookie session (`sg_session`, HttpOnly, SameSite=Lax, 30-day) issued by `/api/users/auth`. Server middleware `frontend/server/middleware/session.js` reads it, populates `event.context.user`, and slides `expires_at` forward (debounced 5 min).
- **Authz:** every mutating endpoint calls one of `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` from `frontend/server/utils/authz.js`. The static check is "no caller can act on someone else unless they're admin"; mutations of role / activation are admin-only.
- **Credentials:** argon2id at rest (`frontend/server/utils/credentials.js`). Legacy plaintext rows are detected on read and rehashed inline. Every account must have at least one of password / PIN; the server enforces that on POST and PUT.
- **System policy:** `system_settings` table. Two known keys today — `allow_pin` and `auto_approve_new_users`. Read via public GET, written via admin-only PUT. Whitelist + boolean coercion in the endpoint guards against pollution.
- **Last-admin protected:** any change that would leave the system with zero active admins (demote / deactivate / delete) is refused with 409.
- **First-run:** Nitro server plugin `frontend/server/plugins/bootstrap.js` refuses to start on a fresh install if `ADMIN_NAME` / `ADMIN_PASSWORD` env aren't set.

---

## When you start a fresh session

1. `cd E:/skillgoblin/.claude/worktrees/wizardly-cohen-224f57`
2. `git log --oneline -6` — confirm you're on `feat/auth-hardening` past `66f1223`.
3. Read `notes/feature-wishlist.md` (locked decisions) and the phase commit bodies in order. The "Phase 4 — admin panel UI" section above is the next chunk of work.
4. Run the test suite once to make sure your environment is good: `docker compose -f docker-compose.test.yml run --rm tests`.
5. Pick up from Phase 4. Same workflow as Phases 0–3 (per-phase commits, Codex review before each commit, tests green before each commit).
