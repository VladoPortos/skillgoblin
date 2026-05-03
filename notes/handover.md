# Handover — picking up after the dependency-cleanup marathon

You are starting a fresh session. The previous session(s) cleared the bulk of the Dependabot backlog: 31 open PRs at the start are now down to **3 open PRs**. Tests still green: 98 vitest + 103 Playwright. Main on commit `1136516`.

The user's first message after `/clear` will tell you whether to start the Nuxt 4 + Tailwind 4 migration (the next planned big slice — see `notes/nuxt4-tailwind4-migration-plan.md`), or do something else. Until then: read this doc, glance at the new migration plan, wait for direction.

---

## TL;DR

- **Repo:** SkillGoblin — self-hosted homelab learning platform. Nuxt 3.16.1 + Nitro 2.11.7 + better-sqlite3 12.x SQLite. SPA mode (`ssr: false`). Designed for trusted local networks.
- **State of `main`:** auth + admin + branding + UI polish + CI + .gitattributes-locked LF + Node 20 + 22 patch/minor bumps shipped. Last merged commit: `1136516` (codeql-action 3→4). Tests green in Docker.
- **What's open:** 3 PRs, all deferred/blocked:
  - [#19](https://github.com/VladoPortos/skillgoblin/pull/19) tailwindcss 3 → 4 — needs visual review (handled in the migration plan)
  - [#25](https://github.com/VladoPortos/skillgoblin/pull/25) nuxt 3 → 4 — multi-day project (handled in the migration plan)
  - [#50](https://github.com/VladoPortos/skillgoblin/pull/50) npm-minor-patch group — broken on `@nuxtjs/tailwindcss 6.14.0` (resolves with Nuxt 4 + Tailwind 4)
- **The user's first message after `/clear`** will pick a slice. Don't pre-empt.

---

## Hard rules (don't violate without asking)

- **No Claude attribution in commits.** No `Co-Authored-By: Claude …` trailer, no `🤖 Generated with [Claude Code]`. The user's memory has this as a hard preference, AND we rewrote history once to strip 9 such trailers. Build commit messages that end at the explanation.
- **Tests run in Docker only.** The host's Node + better-sqlite3 native build is broken on this Windows machine. Use:
  ```
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml run --rm --build tests
  ```
  First build pulls the Playwright image (~1.5 GB, one-time). Subsequent runs ~30–60 sec.
- **Migrations are forward-only and numbered.** Latest is `003_allow_user_registration.js`. New schema change → add `frontend/server/migrations/004_<name>.js` and append to the `index.js` manifest.
- **Codex review per non-trivial change before commit** (when energy permits). Working invocation:
  ```
  node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < notes/<round>-codex-prompt.md
  ```
  The Skill / `/codex:rescue` slash-command path hangs in this environment — Bash invocation is the only one that works. (User's memory captures this.)
- **TDD discipline.** Failing test before code, watch it fail, then GREEN. Test layout: `frontend/tests/unit/` (vitest 4, in-memory SQLite + pure helpers) and `frontend/tests/e2e/` (Playwright against the dockerized app).
- **Never edit `main` directly.** Always branch off `origin/main`, PR, merge.
- **Force-push to main is banned** unless explicitly requested + backups in place.
- **Line endings are LF, locked.** `.gitattributes` enforces `* text=auto eol=lf` plus a belt-and-suspenders `*.sh text eol=lf`. Don't disable.

---

## What shipped this session — 31 merge commits

In rough chronological order, ~22 Dependabot PRs + infrastructure changes:

### Cleanup PR ([#48](https://github.com/VladoPortos/skillgoblin/pull/48))
- `.gitattributes` to lock LF on all text files (Windows `core.autocrlf=true` was breaking `frontend/scripts/entrypoint.sh` shebang)
- 4 unused-var deletes (CodeQL cleanup notes): `requireAdmin` import in `users/index.js`, `SESSION_LIFETIME_MS` import in `sessions.test.js`, unused `admin` const in `admin-panel.spec.js`, dead `freshContext` helper + `pwRequest` import in `branding-runtime-env.spec.js`

### Node bump ([#55](https://github.com/VladoPortos/skillgoblin/pull/55))
- `Dockerfile.prod` and `docker-compose.yml` from `node:18-alpine` to `node:20-alpine`
- Native modules (better-sqlite3, argon2, sharp) recompile cleanly

### Action majors (#14 in autonomous batch, #15 + #16 user-merged via web UI)
- `actions/upload-artifact` 4 → 7
- `actions/checkout` 4 → 6
- `github/codeql-action` 3 → 4

### npm patches/minors merged via gh-side merge (single-package bumps)
- ✅ #20 uuid 9 → 14
- ✅ #21 chokidar 3 → 5
- ✅ #22 vitest 2 → 4 (test count rose to 98)
- ✅ #23 ossf/scorecard-action 2.4.0 → 2.4.3
- ✅ #24 better-sqlite3 9 → 12
- ✅ #26 lru-cache 10 → 11
- ✅ #27 minimatch
- ✅ #28 tar (replaced by #53 after revert)
- ✅ #29 postcss 8.5.3 → 8.5.13
- ✅ #30 rollup (replaced by #54 after revert)
- ✅ #31 svgo 3.3.2 → 3.3.3
- ✅ #32 tar-fs 2.1.2 → 2.1.4
- ✅ #33 nanotar 0.2.0 → 0.2.1
- ✅ #35 lodash 4.17.21 → 4.18.1
- ✅ #38 simple-git 3.27.0 → 3.36.0
- ✅ #39 brace-expansion 2.0.1 → 2.1.0
- ✅ #40 devalue 5.1.1 → 5.8.0
- ✅ #41 yaml 2.7.0 → 2.8.4 (cleared a Trivy MEDIUM CVE)
- ✅ #43 node-forge (replaced by #52 after revert)
- ✅ #45 @nuxt/devtools 2.3.1 → 2.7.0
- ✅ #49 picomatch 2.3.1 → 2.3.2

### Reverted ([#34](https://github.com/VladoPortos/skillgoblin/pull/34) + revert [#51](https://github.com/VladoPortos/skillgoblin/pull/51))
- #34 (serialize-javascript + nitropack group) merged then broke the build via `nitropack 2.12.4` — its bundled `unplugin` crashed with `path.resolve()` on undefined. Nitropack 2.12 is incompatible with Nuxt 3.16.1.
- #51 reverted #34 entirely. The serialize-javascript security part is collateral damage; can be pursued post-Nuxt-4.

### Re-merged after revert (Dependabot recreated as fresh PRs)
- ✅ #52 node-forge (re-do of #43)
- ✅ #53 tar (re-do of #28)
- ✅ #54 rollup (re-do of #30)

### Auto-closed by Dependabot (transitively satisfied)
- #18 npm-minor-patch original group (replaced by [#50](https://github.com/VladoPortos/skillgoblin/pull/50))
- #36 picomatch first attempt (replaced by #49)
- #37 h3 (was already at target via nitropack chain at the time of close)

---

## What's left — 3 open PRs

### Already-planned: Nuxt 4 + Tailwind 4
**See [notes/nuxt4-tailwind4-migration-plan.md](nuxt4-tailwind4-migration-plan.md)** — the full cold-start plan with decisions locked, codebase audit, codemods, and step-by-step tasks.

- [#19](https://github.com/VladoPortos/skillgoblin/pull/19) tailwindcss 3.4 → 4.2 — Phase B of the migration plan. ~110 class instances need rename (mostly via codemod). Visual review by user is the long pole.
- [#25](https://github.com/VladoPortos/skillgoblin/pull/25) nuxt 3.16 → 4.4 — Phase A of the migration plan. Backward-compat with our flat directory layout works, so no `app/` directory move needed. Real breakage: 1 test (`branding-runtime-env.spec.js` reads `window.__NUXT__` which is deleted post-hydration in Nuxt 4) + 1 local function shadowing Nuxt's `navigateTo` auto-import.

**Decisions locked from the user:**
1. Browser support floor (Safari 16.4+ / Chrome 111+ / Firefox 128+) accepted
2. `outline-none` audit per-occurrence — fix focus a11y properly, do NOT blanket-replace with `outline-hidden`
3. Ring 3px width preserved globally via `@theme` override
4. Border `gray-200` default preserved globally via `@layer base` override

### Blocked, will resolve after Nuxt 4 + Tailwind 4
- [#50](https://github.com/VladoPortos/skillgoblin/pull/50) npm-minor-patch group with 7 updates — still has the broken `@nuxtjs/tailwindcss 6.14.0` from the original #18. The globby/unicorn-magic ESM/CJS chain that breaks tailwind/jiti's CJS loader on Nuxt 3 doesn't apply to Nuxt 4 + `@nuxtjs/tailwindcss` v7. After Phase B merges, this should auto-close (or be closeable manually).

---

## Lessons learned this session (READ BEFORE doing similar work)

### 1. `gh pr merge` requires `workflow` scope to merge PRs that touch `.github/workflows/*`
Symptoms: `GraphQL: refusing to allow an OAuth App to create or update workflow ... without 'workflow' scope`. Our `gh` token only has `gist, read:org, repo`. Workaround: either run `gh auth refresh -h github.com -s workflow` (one-time interactive browser auth), or merge those specific PRs via GitHub web UI. We hit this on #15 and #16 — user clicked them in the web UI.

### 2. Don't regenerate the lockfile locally; trust Dependabot's lockfile + gh-side merge
Tried `npm install --package-lock-only` from `node:20-alpine` Docker to handle a stale lockfile. Result: the regenerated lockfile lost the `@rollup/rollup-linux-x64-gnu` optional-dep entry needed by the Playwright Ubuntu test runner. `npm ci` in tests container failed with `MODULE_NOT_FOUND`. Lesson: for Dependabot PRs, **trigger `@dependabot rebase`, wait ~30s for `MERGEABLE/CLEAN`, then `gh pr merge --merge --delete-branch`**. Skip the local checkout + merge main flow. Test main locally after each merge for safety, and revert if broken.

### 3. nitropack majors break Nuxt builds silently. Watch `mergeStateStatus`.
PR #34 bumped nitropack 2.11.7 → 2.12.4 inside a Dependabot group. It merged with `MERGEABLE/UNSTABLE` — I dismissed UNSTABLE as "CI still running" but it actually meant a downstream check was failing. Result: prod build crashed with `path.resolve()` on undefined inside nitropack's bundled unplugin. **Always run a Docker test pass on main after merging anything that changes nitropack, h3, devalue, or other Nuxt internals.** When in doubt, revert via `git revert -m 1 <merge-sha>` (PR #51 is the template).

### 4. Sequential rebase+merge is faster than parallel for Dependabot lockfile PRs
Tried bulk `gh pr merge` across 16 PRs with conflicts — only 2 merged because each merge advances main and the rest go stale. Tried bulk `npm update` on a single branch — hit the Node 18 vs Node 20+ ceiling (chokidar 5, lru-cache 11, vitest 4 all need Node 20+, and `@clack/core` needs `node:util.styleText` which is Node 20.12+). Going single-PR with `@dependabot rebase` (Dependabot is fast — 30s typical) + sequential merge is the simplest reliable path.

---

## How to start the next round

1. **Read [notes/handover.md](handover.md)** — this doc. You're here.
2. **Read [notes/nuxt4-tailwind4-migration-plan.md](nuxt4-tailwind4-migration-plan.md)** — the full execution plan for #19 + #25 with codebase audit and locked decisions.
3. **Optional reads:**
   - [notes/feature-wishlist.md](feature-wishlist.md) — original wishlist; most shipped
   - [notes/architecture-map.md](architecture-map.md) — implementation map. Stale on auth + branding details (predates Phase 1) but accurate on overall structure.
4. **Confirm green starting state**:
   ```
   docker compose -f docker-compose.test.yml run --rm --build tests
   ```
   Should print 11 vitest files / 98 tests + 103 Playwright passed. If not — investigate before doing anything else.
5. **Wait for the user's first message** to pick the slice. The most likely picks:
   - **"Run the migration plan"** — execute Phase A (Nuxt 4) then Phase B (Tailwind 4). Probably ~3 hours including the user's visual review.
   - **"Do Phase A only"** — Nuxt 4 in isolation. Tailwind 4 saved for another day.
   - **Something unrelated** — course content polish, fresh feature, etc.
6. **Don't assume** — wait for direction.

---

## Workflow per change (proven this session)

For Dependabot PRs:
1. **Trigger rebase**: `gh pr comment <N> --body "@dependabot rebase"`
2. **Poll mergeable**: 30s typical
3. **Merge via gh** (DON'T checkout locally first): `gh pr merge <N> --merge --delete-branch`
4. **Sync main**: `git fetch origin main && git checkout --detach origin/main && git -C E:/skillgoblin pull --ff-only origin main`
5. **Test on main**: full Docker test pass
6. **If broken: `git revert -m 1 <merge-sha>`** as a new PR ([#51](https://github.com/VladoPortos/skillgoblin/pull/51) is the template)

For our own work (cleanups, features, the migration plan):
1. **Branch off `origin/main`**: `git checkout -b <name> origin/main`
2. **Brainstorm if creative work** — invoke `superpowers:brainstorming` skill. Skip if the user says "quick in place".
3. **Plan if non-trivial** — invoke `superpowers:writing-plans` after brainstorm. Skip for one-line fixes.
4. **Execute** via subagents if multi-task, inline for one-shot edits.
5. **Test in Docker** between every meaningful change.
6. **Codex review for non-trivial changes** before commit (when energy allows). Bash invocation only.
7. **Push + PR + merge**: `gh pr merge <N> --merge --delete-branch` (the local-checkout error from `gh` is expected because main is in the other worktree at `E:/skillgoblin/`; the GitHub-side merge succeeds despite the error).
8. **Cleanup after merge**: detach this worktree (`git checkout --detach origin/main`), delete the merged local branch (`git branch -D <name>`), update main in `E:/skillgoblin` (`git -C E:/skillgoblin pull --ff-only origin main`), then start the next slice from a fresh `git checkout -b ... origin/main`.

---

## Local environment

### Manual-test stack
`docker-compose.manual.yml` (untracked) runs a fresh-install instance for visual testing on port 3001. Admin: `admin` / `ChangeMe2026!`. Sandbox at `manual-test/data/`. Reset to fresh-install: `docker compose -f docker-compose.manual.yml down && rm -rf manual-test/data/database/* && docker compose -f docker-compose.manual.yml up --build -d`.

The manual stack mounts `./manual-test/data/branding:/app/data/branding` so you can drop test logos/banners in there to verify branding overrides.

### Worktree state
Work happens in worktrees at `E:/skillgoblin/.claude/worktrees/<name>/`. The main repo is at `E:/skillgoblin/`. The `gh pr merge` flow errors with `'main' is already used by worktree at E:/skillgoblin` — that's expected; the merge succeeds server-side despite the error. After merge, sync `E:/skillgoblin`'s main with `git -C E:/skillgoblin pull --ff-only origin main`.

### Codex setup
- Plugin at `C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/`
- Auth: already done. If `codex --version` says `unauthenticated`, run `codex login`.

### Lockfile changes (Dependabot will produce them)
**Don't regenerate manually** — see Lesson 2 above. Dependabot updates the lockfile in its PRs automatically; gh-side merge handles the rest correctly.

If we ever need to bump deps ourselves:
```
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W)/frontend:/work" -w "//work" node:20-alpine \
  sh -c "npm install --no-audit --no-fund"
```
**Caveat:** the rollup optional-deps issue may bite. If `npm ci` fails on `@rollup/rollup-linux-x64-gnu`, switch the regen image from `node:20-alpine` to `node:20-slim` (Debian, not Alpine) so the lockfile picks up both musl and gnu rollup binaries.

---

## Architectural cheat sheet (60-second version)

- **Stack:** Nuxt 3.16.1 (SSR off — pure SPA), Tailwind 3.4, Vue 3 composition API, better-sqlite3 12.x SQLite. Node 20.
- **Auth:** `sg_session` cookie (HttpOnly, SameSite=Lax, 30-day) issued by `/api/users/auth`. Server middleware [session.js](frontend/server/middleware/session.js) reads it, populates `event.context.user`, slides expiry forward (debounced 5 min). Skips cookie processing for `/api/content/`, `/api/course-thumbnail/`, `/api/random-banner`, `/api/logo`, `/api/login-banner`, `/api/webmanifest`, `/_nuxt/`, `/favicon`, `/banners/`, `/images/`, `/logos/` so those endpoints can be publicly cached without leaking Set-Cookie.
- **Authz:** every mutating endpoint calls `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` from [authz.js](frontend/server/utils/authz.js). Static rule: no caller can act on someone else unless admin; mutations of role / activation are admin-only. The single exception is `POST /api/users` which gates on `system_settings.allow_user_registration` instead.
- **Credentials:** argon2id. Legacy plaintext detected on read and rehashed inline.
- **Branding:** env vars read at server startup via `frontend/scripts/entrypoint.sh` mapping `APP_*` → `NUXT_PUBLIC_BRANDING_*`. Nuxt's runtimeConfig populates `runtimeConfig.public.branding` which `app.vue` consumes via `useHead`. `/api/webmanifest` reads `process.env` directly via `readBranding()`.
- **First-run:** server plugin [bootstrap.js](frontend/server/plugins/bootstrap.js) refuses to start on a fresh install if `ADMIN_NAME` / `ADMIN_PASSWORD` env aren't set. Same plugin warns about invalid `APP_THEME_COLOR` / `APP_BACKGROUND_COLOR` hex values.
- **Migrations:** numbered, forward-only, in `frontend/server/migrations/`. Latest is `003_allow_user_registration.js`. Manifest in `index.js`.

---

## Recommended starting slice

**Run the Nuxt 4 + Tailwind 4 migration per [notes/nuxt4-tailwind4-migration-plan.md](nuxt4-tailwind4-migration-plan.md).**

Phase A (Nuxt 4) is straightforward — codemod handles most of it, the only real changes are 1 test rewrite and 1 function rename. Should take ~30 min for execution + a Docker test pass.

Phase B (Tailwind 4) is bigger because of the visual review. The `@tailwindcss/upgrade` codemod handles ~110 class renames automatically, but the `outline-none` audit needs human judgment per-occurrence (Decision 2 — fix a11y properly), and the user wants to walk through every page visually. Plan ~2 hours including the visual review.

After both merge, [#50](https://github.com/VladoPortos/skillgoblin/pull/50) should auto-close, leaving 0 open Dependabot PRs.
