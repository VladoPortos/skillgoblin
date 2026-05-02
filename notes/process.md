# Build process & workflow rules

Locked decisions for how we work on this codebase from now on. Anything in conflict with this doc is a bug.

## Branching

- **Never edit `main` directly.** All work lives on a feature branch off main.
- Current working branch: `claude/wizardly-cohen-224f57` (a worktree). Can be renamed to a more descriptive name (e.g. `feat/auth-hardening`) before the PR if preferred — flag in chat.
- One coherent change per PR. Auth-and-user-management is one PR; future feature rounds get their own.

## Migrations

- We are introducing a real migration system as part of this round. **Every schema change from this round forward goes through it.** Never `CREATE TABLE IF NOT EXISTS` for a new column, never `ALTER TABLE` from app code outside the migration runner.

- Mechanism: a `migrations` table (`id INTEGER PK`, `name TEXT UNIQUE`, `applied_at TIMESTAMP`) plus a directory of numbered migration files (e.g. `frontend/server/migrations/001_initial.js`, `002_auth_hardening.js`, ...). On boot, the runner checks which migrations have not been applied, runs them in order in a transaction, and records each one.
- Migrations are forward-only. No down migrations. If we need to revert, we write a new forward migration that undoes the change.
- Each migration is idempotent against its own state — running it twice on the same DB must not double-apply.
- Initial migration captures the *current main schema* exactly so that fresh installs start in the same state as upgraded installs after migration 1.
- The DB connection in `frontend/server/utils/db.js` runs the migration runner before returning a usable handle. No request handler ever sees a partially-migrated DB.

## Tests

- We currently have **zero tests**. Setting up the test infrastructure is part of this round, not a future task.
- Two layers, both runnable via `npm test` from `frontend/`:
  - **Unit / integration**: Vitest. Targets server utilities (migration runner, auth helpers, session middleware), composables in isolation, and pure logic. Fast — runs in seconds.
  - **End-to-end**: Playwright. Runs against the production-build container on a non-default port (e.g. `:3010`) so it never collides with a dev server. Covers the user-facing flows that matter: login, set-credentials-on-upgrade, course list loads, video plays, admin actions, role enforcement.
- A change is not "done" until both layers pass.

## Verification cadence

For every change worth committing:

1. Make the change.
2. Run `npm test` — both layers green.
3. Build & start the container, hit the app with Playwright (smoke pass): no console errors, primary flow works.
4. Hand the diff (or the new files) to **Codex** for an independent review pass.
   - **Invocation**: direct Bash, never the slash command (the `/codex:rescue` path hangs in this environment). Working call:
     ```
     node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/<version>/scripts/codex-companion.mjs" task "<prompt>"
     ```
   - For review-only (no edits): keep the prompt focused on a single artifact at a time.
   - For substantial implementation work, optionally pass `--write` so Codex can edit files. Always review its diff before committing.
5. Address Codex feedback, re-run tests, then commit.

The goal is "every commit on this branch ships something that works." Not "we'll fix it later."

## Codex usage rules

- Codex is a verifier and a second pair of hands, not the primary author of architectural decisions. Decisions stay in chat with the user.
- For each PR phase, Codex reviews:
  - The migration code (does it apply cleanly to a pre-PR DB? does it leave the schema in the documented state?).
  - The auth logic (any bypass we missed? constant-time compare? is the cookie shape right?).
  - The session middleware (does every mutating endpoint actually go through it?).
  - The Playwright test coverage (did we test the failure modes, not just the happy path?).
- Codex output goes into the PR description as a "second-opinion" note so future readers know it was checked.

## Scope discipline

- Auth and user management is the entire current round. New features wait.
- Cosmetic / UI polish that's clearly low-risk (icons, copy, padding) is OK to ship alongside if it's in flight on the same files. Avoid bigger UI rewrites.
- Anything tempting that isn't auth → log it in `feature-wishlist.md` for a future round, do not implement.

## Definition of done for this round

- All `users`-table mutating endpoints require an authenticated session and the right role.
- `/api/users/auth` issues an HTTP-only session cookie backed by `user_sessions` rows.
- Plaintext passwords/PINs are gone from the DB (migrated inline on first login).
- The "no credentials" and "PIN disabled" upgrade flows work end-to-end.
- The migration framework is in place, the schema-version is tracked, and a fresh install + an upgraded install both end up in the same state.
- Vitest + Playwright are wired up. `npm test` runs both. They pass.
- The PR description links Codex's review output.
- The README documents the new env vars, the first-run-admin requirement, and the migration story for upgraders.
