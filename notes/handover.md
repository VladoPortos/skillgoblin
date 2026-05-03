# Handover — picking up after auth-hardening

You are starting a fresh session. The auth-hardening + UX-polish round is fully shipped on `main` (PRs [#6](https://github.com/VladoPortos/skillgoblin/pull/6) + [#7](https://github.com/VladoPortos/skillgoblin/pull/7) merged). This doc is the cold-start brief for the **next** round of work.

The user already has a list of remaining categories. Their first message will tell you which one they picked. Until then: don't assume — read this doc, glance at the code references it points to, and wait for direction.

---

## TL;DR

- **Repo:** SkillGoblin — self-hosted homelab learning platform. Nuxt 3 + Nitro + better-sqlite3 SQLite. Designed for trusted local networks.
- **State of `main`:** auth + admin panel + credential UX all shipped. Tests are 75 vitest unit + 82 Playwright e2e, all green in Docker.
- **What's open:** customization (operator branding), course content polish (course.json, SRT→VTT, per-lesson README), UI polish (icons, avatar live preview), plus a list of small deferred-quality items.
- **The user's first message after /clear** will pick a slice. Don't pre-empt it.

---

## Hard rules (don't violate without asking)

- **No Claude attribution in commits.** No `Co-Authored-By: Claude …` trailer, no `🤖 Generated with [Claude Code]`. The user's memory has this as a hard preference. Build commit messages that end at the explanation.
- **Tests run in Docker only.** The host's Node + better-sqlite3 native build is broken on this Windows machine. Use:
  ```bash
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml run --rm --build tests
  ```
  First build pulls the Playwright image (~1.5 GB, one-time) and the app image. Subsequent runs ~30 sec.
- **Migrations are forward-only and numbered.** New schema change → add `frontend/server/migrations/003_<name>.js` and append to the `index.js` manifest.
- **Codex review per phase before commit.** Working invocation:
  ```bash
  node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < notes/<round>-codex-prompt.md
  ```
  The Skill / `/codex:rescue` slash-command path hangs in this environment — Bash invocation is the only one that works. (The user's memory captures this too.)
- **TDD discipline.** Failing test before code, watch it fail, then GREEN. Existing test layout: `frontend/tests/unit/` (vitest, against in-memory SQLite) and `frontend/tests/e2e/` (Playwright against the dockerized app).

---

## What shipped (don't re-do this work)

Across PRs #6 and #7:

- **argon2id credentials** with inline rehash for legacy plaintext rows ([credentials.js](frontend/server/utils/credentials.js))
- **Cookie sessions** stored in `user_sessions` (sha256, 30-day sliding) with admin "kick all" and per-user revoke ([sessions.js](frontend/server/utils/sessions.js), [middleware/session.js](frontend/server/middleware/session.js))
- **`requireAuth` / `requireAdmin` / `requireSelfOrAdmin`** on every mutating endpoint ([authz.js](frontend/server/utils/authz.js))
- **First-run admin bootstrap** from `ADMIN_NAME` / `ADMIN_PASSWORD` env vars; refuses to start otherwise ([bootstrap.js](frontend/server/utils/bootstrap.js))
- **Multi-admin with last-admin protection** ([lastAdminGuard.js](frontend/server/utils/lastAdminGuard.js))
- **In-memory rate limiter** on `/api/users/auth` ([rate-limit.js](frontend/server/utils/rate-limit.js))
- **Forward-only migration framework** with a `migrations` bookkeeping table ([migrations.js](frontend/server/utils/migrations.js))
- **Admin Panel UI** — users list with activate/promote/reset/kick/delete, sessions drilldown, pending-only filter, system settings tab ([AdminPanel.vue](frontend/components/AdminPanel.vue))
- **Login modes:** password / PIN / both. Login modal toggle when user has both. PIN bridge for the pin_disabled upgrade flow.
- **My Profile editor** — independent password and PIN panels, each saves on its own button with inline ✓/✗ feedback ([UserManagement.vue](frontend/components/UserManagement.vue) — file kept its old name; user-facing label is "My Profile")
- **Backdrop dismiss** on every modal in the app, with in-flight save guards
- **Runtime-toggleable system settings** (`allow_pin`, `auto_approve_new_users`) via `/api/system-settings` ([system-settings/index.js](frontend/server/api/system-settings/index.js))
- **README rewrite** with the new auth model, env vars, security caveats, upgrade story
- **`docker-compose.example.yml`** with placeholder admin credentials for first install

---

## What's left — the user will pick

### A. Customization / branding

Operator-configurable so a homelab user can re-skin their instance. None of these built yet.
- App name + short name configurable via env (window title, web manifest, header)
- App description configurable
- Theme color / background color configurable
- Custom logo: drop `logo.png` in a documented location, served via `/api/logo`, falls back to bundled defaults
- Web manifest generated dynamically so the PWA install reflects operator branding

These cluster well as one round (same shape: env config → exposed via small endpoint → consumed by frontend templates).

### B. Course content polish

Independent of auth. Better default UX for course libraries.
- **`course.json` metadata override** — drop a JSON in a course folder to set `title` / `description` / `category` / `releaseDate`. Folder-derived defaults still work without it.
- **SRT → VTT auto-conversion** so user-supplied subtitles play in `<video>` directly. Detect language from filename suffixes (`name.en.srt`, `name_es.srt`).
- **Captions vs subtitles distinction** when filenames hint (`*_cc.*`).
- **Per-lesson README** rendered alongside the video player.

### C. UI polish

Small ergonomic items.
- Missing icons in the user dropdown menu (some entries text-only)
- Avatar live preview while editing profile

### D. Deferred quality items

Captured in commit bodies. Not blockers — defer-list candidates if/when convenient.

| Item | Where | Why deferred |
|---|---|---|
| `X-Forwarded-Proto` / `X-Forwarded-For` trusted unconditionally | [middleware/session.js](frontend/server/middleware/session.js), [api/users/auth.js](frontend/server/api/users/auth.js) | Acceptable behind a real reverse proxy — the documented deployment model |
| `touchSession` doesn't check `changes` count | [utils/sessions.js](frontend/server/utils/sessions.js) | Race with logout briefly re-issues a cookie for a deleted row; next request clears it |
| `/api/users/[id]` GET leaks `isAdmin`, `is_active`, `has_password`, `has_pin` | [api/users/[id].js](frontend/server/api/users/[id].js) | Login picker needs these |
| Migration runner uses raw `BEGIN` | [utils/migrations.js](frontend/server/utils/migrations.js) | No nested transactions yet; swap to `db.transaction()` when one needs to nest |
| `001_initial` thumbnail_data column ordering differs between fresh and upgraded | [migrations/001_initial.js](frontend/server/migrations/001_initial.js) | Harmless for named queries; only matters if `SELECT *` is ever used |
| Bootstrap-credentials success-path e2e gap | [tests/e2e/upgrade-flows.spec.js](frontend/tests/e2e/upgrade-flows.spec.js) | Would need a fixture inserting a legacy no-creds row; failure cases are covered |
| Rate limiter is per-process | [utils/rate-limit.js](frontend/server/utils/rate-limit.js) | Cluster mode isn't used; documented in the file |

### Out of scope

Not on the wishlist; only revisit if the user asks:
- Multi-tenant / multi-org auth
- OAuth / SSO
- 2FA
- Public-internet-grade hardening (WAF, paranoid rate-limits)

---

## How to start the next round

1. **Read [notes/feature-wishlist.md](feature-wishlist.md)** — the locked design doc. Captures *what* and *why*. Anything in there is decided; don't relitigate.
2. **Read [notes/architecture-map.md](architecture-map.md)** — implementation map. Where things live, how layers connect.
3. **Read [notes/process.md](process.md)** — workflow rules. Phases, commits, atomic units.
4. **Confirm green starting state**:
   ```bash
   docker compose -f docker-compose.test.yml run --rm --build tests
   ```
   Should print `75 passed (vitest)` + `82 passed (e2e)`. If not — investigate before doing anything else.
5. **Wait for the user's first message** to pick the slice (A/B/C/D from above). Don't assume.
6. **Once they pick, propose a brief plan** (2–4 bullets, the design decisions, locked in by their go-ahead) before touching code. Same pattern as the auth phases.
7. **TDD per slice.** Write the failing test, watch it fail, implement minimum, watch it pass, refactor.
8. **Codex review before commit.** Write a `notes/<round>-codex-prompt.md` describing the change, severity gating, and what to focus on. Run via the Bash invocation above. Address BLOCKER + HIGH + reasonable MEDIUMs; document LOW deferrals in commit body.
9. **Commit per phase, push, open PR.** Keep PR scoped to one category — don't mix customization with course-pipeline work in the same PR.

---

## Local environment

### Manual-test stack

There's a `docker-compose.manual.yml` (untracked, not in main — it lives only in worktree filesystem) that runs a fresh-install instance for visual testing:
- URL: `http://localhost:3001`
- Admin: `admin` / `ChangeMe2026!`
- Sandbox: `manual-test/data/{database,content}/` so it never touches the real `./data/`
- Stop: `docker compose -f docker-compose.manual.yml down`
- Reset to fresh-install: `docker compose -f docker-compose.manual.yml down && rm -rf manual-test/data/database/* && docker compose -f docker-compose.manual.yml up --build -d`

If you need a fresh manual stack and it doesn't exist yet, look at `docker-compose.example.yml` (committed) for the recommended layout, or recreate `docker-compose.manual.yml` with `Dockerfile.prod`, port 3001, `manual-test/` mount, and `ADMIN_NAME`/`ADMIN_PASSWORD` envs.

### Worktree state

Work happened in a worktree at `E:/skillgoblin/.claude/worktrees/wizardly-cohen-224f57/`. The main repo is at `E:/skillgoblin/`. Both worktrees share the same git database; `main` is checked out in the main worktree. Don't try to `git checkout main` from the worktree — it'll fail with "already used by worktree at E:/skillgoblin". Make new feature branches with `git checkout -b <name> origin/main`.

### Lockfile changes (rare)

If you bump a frontend dep, regenerate the lockfile *inside Docker* (host build is broken):
```bash
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W)/frontend:/work" -w "//work" node:18-alpine \
  sh -c "npm install --package-lock-only --no-audit --no-fund"
```

### Codex setup

- Plugin at `C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/`
- Auth: already done. If `codex --version` says `unauthenticated`, run `codex login`.

---

## Architectural cheat sheet (30-second version)

- **Auth:** `sg_session` cookie (HttpOnly, SameSite=Lax, 30-day) issued by `/api/users/auth`. Server middleware [session.js](frontend/server/middleware/session.js) reads it, populates `event.context.user`, slides expiry forward (debounced 5 min).
- **Authz:** every mutating endpoint calls one of `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` from [authz.js](frontend/server/utils/authz.js). Static rule: no caller can act on someone else unless admin; mutations of role / activation are admin-only.
- **Credentials:** argon2id. Legacy plaintext detected on read and rehashed inline. Every account must have at least one of password / PIN; server enforces on POST and PUT.
- **PIN bridge:** PIN auth permitted when `allow_pin=true` OR user has no password (the one-time bridge). After bridge auth, response carries `needsCredentialUpdate: 'pin_disabled'` so the frontend prompts for a password. Server's PUT no longer auto-clears PINs when `allow_pin=false` — leaves them in place for if the operator re-enables.
- **Sessions:** opaque base64url tokens, sha256-hashed in DB, one row per active session. Survive container restarts. Admin "kick" + user "log out all devices" both `DELETE FROM user_sessions WHERE …`.
- **System policy:** `system_settings` table. Two known keys today — `allow_pin` and `auto_approve_new_users`. Read via public GET, written via admin-only PUT. Whitelist + boolean coercion in the endpoint.
- **Last-admin protection:** any change leaving zero active admins is refused with 409.
- **First-run:** server plugin [bootstrap.js](frontend/server/plugins/bootstrap.js) refuses to start on a fresh install if `ADMIN_NAME`/`ADMIN_PASSWORD` env aren't set.
- **Modal pattern:** every modal supports backdrop dismiss + X/Cancel; in-flight saves guard the dismiss path so an accidental click-out can't hide a pending failure.

---

## Recommended starting slice

If the user is open to a recommendation: **course content polish (B)**. It improves the existing libraries materially (subtitles working out of the box, course.json overrides, per-lesson README) and operators feel the value immediately. Customization (A) is more cosmetic. UI polish (C) is small enough to bundle with whichever you do.

But that's a recommendation, not a decision — wait for the user's pick.
