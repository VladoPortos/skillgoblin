# SkillGoblin Targeted Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the confirmed authorization, indexing, identity, configuration, HTTP-range, and file-handle defects while preserving LAN-oriented legacy account claiming.

**Architecture:** Reuse the existing H3 authorization helpers and forward-only migration framework. Extract pure range parsing for direct tests, make filesystem reconciliation explicit, and enforce identity invariants in SQLite rather than relying on preflight checks.

**Tech Stack:** Nuxt 4, Nitro/H3, JavaScript ESM, better-sqlite3, Chokidar, Vitest, Playwright, Docker Compose.

## Global Constraints

- Preserve existing course IDs, progress keys, users, sessions, and course metadata.
- Keep anonymous first-claim recovery for active legacy accounts with no credentials.
- Require an active session for course metadata and media.
- Never delete or merge duplicate users automatically.
- Write and run a failing regression test before each production behavior change.

---

### Task 1: Protect course metadata and media

**Files:**
- Modify: `frontend/server/middleware/session.js`
- Modify: `frontend/server/api/courses.js`
- Modify: `frontend/server/api/categories.js`
- Modify: `frontend/server/api/courses/[id].js`
- Modify: `frontend/server/api/course-thumbnail/[id].js`
- Modify: `frontend/server/api/content/[...path].js`
- Test: `frontend/tests/e2e/sessions.spec.js`

**Interfaces:**
- Consumes: `requireAuth(event)` from `server/utils/authz.js`.
- Produces: 401 responses for anonymous course requests and unchanged responses for active sessions.

- [ ] Add API regression cases proving anonymous metadata, thumbnail, and content requests are rejected while authenticated requests succeed.
- [ ] Run `npm run test:e2e -- sessions.spec.js` and confirm the anonymous cases fail against current behavior.
- [ ] Add `requireAuth`, enable session lookup on media paths, and change media cache headers from `public` to `private`.
- [ ] Re-run the focused e2e file and confirm it passes.

### Task 2: Retain and document LAN legacy first-claim behavior

**Files:**
- Modify: `frontend/tests/e2e/upgrade-flows.spec.js`
- Modify: `SECURITY.md`

**Interfaces:**
- Consumes: `POST /api/users/bootstrap-credentials`.
- Produces: documented first-claim semantics restricted to active, credential-less accounts.

- [ ] Add regression cases covering successful first claim, refusal after credentials exist, and refusal for inactive users.
- [ ] Run the focused upgrade tests and confirm current behavior satisfies the approved contract.
- [ ] Document the LAN-only first-claim risk and administrator reset recovery.

### Task 3: Reconcile course filesystem state

**Files:**
- Modify: `frontend/server/utils/courseWatcher.js`
- Test: `frontend/tests/unit/courseWatcher.test.js`

**Interfaces:**
- Produces: startup reconciliation and `topLevelCoursePath(contentDir, changedPath)` for watcher event routing.

- [ ] Add unit tests showing a populated database does not bypass reconciliation and nested paths map to their top-level course.
- [ ] Run the focused unit test and confirm failure under the current early-return/depth-zero design.
- [ ] Remove the populated-database early return and debounce nested add/change/unlink events by top-level course.
- [ ] Re-run the focused tests and confirm they pass.

### Task 4: Prevent course-ID collision overwrites

**Files:**
- Modify: `frontend/server/utils/courseDatabase.js`
- Test: `frontend/tests/unit/courseDatabase.test.js`

**Interfaces:**
- Produces: `saveCourseToDb(courseData, folderName, dbInstance?)` returning a collision error without modifying the existing row.

- [ ] Add a test with two folder names mapping to one ID and assert the first row remains unchanged.
- [ ] Run the focused test and confirm the existing update behavior fails it.
- [ ] Query `folder_name` with the existing row and reject mismatched folders before `UPDATE`.
- [ ] Re-run the test and confirm it passes.

### Task 5: Enforce username uniqueness

**Files:**
- Create: `frontend/server/migrations/004_unique_user_names.js`
- Modify: `frontend/server/migrations/index.js`
- Test: `frontend/tests/unit/migration_004.test.js`

**Interfaces:**
- Produces: SQLite unique index `idx_users_name_nocase_unique`.

- [ ] Add migration tests proving `Alice` and `alice` cannot coexist and existing duplicates produce an actionable migration failure without row deletion.
- [ ] Run the focused migration test and confirm it fails because migration 004 does not exist.
- [ ] Add duplicate preflight detection and `CREATE UNIQUE INDEX ... ON users(name COLLATE NOCASE)`.
- [ ] Re-run migration tests and confirm they pass.

### Task 6: Correct byte ranges and handle lifecycle

**Files:**
- Create: `frontend/server/utils/httpRange.js`
- Modify: `frontend/server/api/content/[...path].js`
- Test: `frontend/tests/unit/httpRange.test.js`

**Interfaces:**
- Produces: `parseSingleByteRange(header, size, maxChunkSize)` returning `{ start, end }` or `null`.

- [ ] Add tests for open-ended, bounded, suffix, malformed, multiple, reversed, and out-of-bounds ranges.
- [ ] Run the focused test and confirm failure because the helper is absent.
- [ ] Implement the pure parser, return 416 for `null`, and replace cached handles with open/read/close in `finally`.
- [ ] Re-run focused tests and confirm they pass.

### Task 7: Repair documented configuration

**Files:**
- Modify: `frontend/server/utils/courseHelpers.js`
- Modify: `frontend/nuxt.config.js`
- Modify: `docker-compose.yml`
- Test: `frontend/tests/unit/config-aliases.test.js`

**Interfaces:**
- Produces: `CONTENT_DIR`/`CONTENT_PATH` and `DATABASE_PATH`/`DB_PATH` alias support.

- [ ] Add tests for content-directory precedence and inspect Compose configuration for bootstrap variable forwarding.
- [ ] Run the focused test and confirm `CONTENT_DIR` is currently ignored.
- [ ] Implement aliases, align the database default, and add required Compose substitutions for admin credentials.
- [ ] Re-run focused tests and `docker compose config` with test environment values.

### Task 8: Full verification

**Files:**
- Review all modified files.

**Interfaces:**
- Consumes: all prior task outputs.

- [ ] Run `npm run test:unit` and record the exact pass/fail count.
- [ ] Run `npm run build` and record the exit status.
- [ ] Run the Dockerized e2e suite if Docker is available.
- [ ] Inspect `git diff --check`, `git diff --stat`, and the complete diff for unintended changes.
