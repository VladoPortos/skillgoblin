# Handover — picking up after the CI/security setup round

You are starting a fresh session. The CI/security infrastructure is in place on `main`: Dependabot, CodeQL, Trivy, and OSSF Scorecard all run on every push + PR. They've already produced **18 open Dependabot PRs** and **a stack of CodeQL/Trivy/Scorecard findings** in the Security tab. This round is about **triage and fix**, not new features.

The user already knows the state. Their first message after `/clear` will tell you whether to start with the Dependabot PRs, the CodeQL findings, or both. Until then: read this doc, glance at the Security tab + open PR list, wait for direction.

---

## TL;DR

- **Repo:** SkillGoblin — self-hosted homelab learning platform. Nuxt 3 + Nitro + better-sqlite3 SQLite. Designed for trusted local networks.
- **State of `main`:** auth + admin + branding + UI polish + CI shipped. Last merged commit: `120b627` (trivy-action version fix). Tests still 80 vitest + 103 Playwright, all green in Docker.
- **What's open:** 18 Dependabot PRs (mix of safe patches and risky majors), 7 CodeQL findings (3 actionable warnings + 4 cleanup notes), 71 Trivy findings (mostly config nits + a few real CVEs that overlap with Dependabot PRs), 22 Scorecard findings (pin-by-hash warnings — defensible to ignore for a homelab).
- **History was rewritten** earlier in the previous session — the Co-Authored-By: Claude trailer was filter-repo'd out of all 9 historical commits. Current main = clean attribution to VladoPortos only. **Do not re-introduce the trailer in any new commits.**
- **The user's first message after `/clear`** will pick a slice. Don't pre-empt it.

---

## Hard rules (don't violate without asking)

- **No Claude attribution in commits.** No `Co-Authored-By: Claude …` trailer, no `🤖 Generated with [Claude Code]`. The user's memory has this as a hard preference, AND we just rewrote history to strip 9 such trailers — adding new ones would be especially insulting. Build commit messages that end at the explanation.
- **Tests run in Docker only.** The host's Node + better-sqlite3 native build is broken on this Windows machine. Use:
  ```
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml run --rm --build tests
  ```
  First build pulls the Playwright image (~1.5 GB, one-time). Subsequent runs ~30–60 sec.
- **Migrations are forward-only and numbered.** Latest is `003_allow_user_registration.js`. New schema change → add `frontend/server/migrations/004_<name>.js` and append to the `index.js` manifest.
- **Codex review per non-trivial change before commit.** Working invocation:
  ```
  node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < notes/<round>-codex-prompt.md
  ```
  The Skill / `/codex:rescue` slash-command path hangs in this environment — Bash invocation is the only one that works. (User's memory captures this.)
- **TDD discipline.** Failing test before code, watch it fail, then GREEN. Test layout: `frontend/tests/unit/` (vitest, in-memory SQLite + pure helpers) and `frontend/tests/e2e/` (Playwright against the dockerized app).
- **Never edit `main` directly.** Always branch off `origin/main`, PR, merge.
- **Force-push to main is banned** unless explicitly requested + backups in place. We did one force-push this round (the trailer-strip) with two zip backups + a remote backup branch (since deleted). Don't repeat without that level of safety.

---

## What shipped (don't re-do this work)

In rough chronological order across PRs #6, #7, #9, #10, #11, #12, #17:

### Auth / user management (PRs #6 + #7)
- argon2id credentials with inline rehash for legacy plaintext rows ([credentials.js](frontend/server/utils/credentials.js))
- Cookie sessions in `user_sessions` (sha256, 30-day sliding) with admin "kick all" + per-user revoke ([sessions.js](frontend/server/utils/sessions.js))
- `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` on every mutating endpoint ([authz.js](frontend/server/utils/authz.js))
- First-run admin bootstrap from `ADMIN_NAME` / `ADMIN_PASSWORD` ([bootstrap.js](frontend/server/utils/bootstrap.js))
- Multi-admin with last-admin protection
- In-memory rate limiter on `/api/users/auth`
- Forward-only migration framework
- AdminPanel UI — users tab + sessions drilldown + system settings tab
- Login modes: password / PIN / both
- My Profile editor with independent password + PIN panels
- Backdrop dismiss on every modal with in-flight save guards
- Runtime-toggleable `allow_pin` and `auto_approve_new_users` settings

### Registration lock (PR #9)
- New env `ALLOW_USER_REGISTRATION` (defaults `true`) → seeds `system_settings.allow_user_registration` on first boot
- `POST /api/users` returns 403 when registration disabled and caller isn't an active admin
- Login screen hides the "New User" tile when disabled
- AdminPanel → Users gets a "Create User" modal (admin-only path that bypasses both the registration gate AND `auto_approve_new_users`)
- AdminPanel → Settings gets a third toggle for `allow_user_registration`

### Customization / branding (PR #10)
- 5 env vars: `APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `APP_THEME_COLOR`, `APP_BACKGROUND_COLOR`
- Defaults preserve current SkillGoblin look exactly when env unset
- Default theme/bg color changed from `#ffffff` to `#111827` (Tailwind gray-900) — matches the dark-by-default app
- Two drop-in files at `data/branding/`: `logo.png` (small square) + `login-banner.png` (wide banner — disables the random rotation when present)
- Three new endpoints: `/api/logo`, `/api/login-banner`, `/api/webmanifest`
- Static `frontend/public/site.webmanifest` removed; `<link rel="manifest">` points at `/api/webmanifest`
- Entrypoint script at `frontend/scripts/entrypoint.sh` maps operator-facing `APP_*` env to Nuxt's native `NUXT_PUBLIC_BRANDING_*` runtime-override vars (because `nuxt.config.js` runs at Docker build time, not runtime)
- Nitro plugin at `frontend/server/plugins/branding.js` — defensive no-op for dev mode

### UI polish (PR #11)
- Outline icons on Logout + Delete Account in user dropdown (matching the existing icons on Admin Panel / Rescan / My Profile)
- Sticky avatar preview in My Profile editor — preview pins to top of modal scroll while user scrolls through AvatarSelector options. Vue reactivity already updated the preview live; the issue was visibility on smaller screens.

### CI / security setup (PRs #12 + #17)
- `.github/dependabot.yml` — weekly npm + github-actions scans, minor/patch grouped, majors individual
- `.github/workflows/codeql.yml` — SAST on push/PR/weekly with `security-and-quality` query suite
- `.github/workflows/trivy.yml` — filesystem CVE scan + Dockerfile/compose config scan
- `.github/workflows/scorecard.yml` — OSSF Scorecard scoring with badge publish
- README badges for CodeQL, Trivy, OSSF Scorecard at top of file
- PR #17 fixed `trivy-action@0.28.0` → `v0.36.0` (the original tag didn't exist)

### Git history rewrite (no PR — direct force-push)
- All 9 commits with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer were stripped via `git filter-repo`
- 55 commits got new SHAs (the 9 + descendants)
- Backup zips: `E:\skillgoblin-git-backup-2026-05-03-pre-claude-strip-1.zip` and `C:\Users\vlado\skillgoblin-git-backup-2026-05-03-pre-claude-strip-2.zip` — keep until confident, then delete
- Remote backup branch `backup/pre-claude-attribution-strip` was deleted to remove Claude from the contributors list
- **GitHub PR pages (#3 through #11) still show old commit SHAs in their "Commits" tab** — that's GitHub's permanent PR archive, not fixable without GitHub support. Cosmetic only.

---

## What's left — the user will pick

### Group 1: Dependabot PRs (18 open)

The user enabled "Dependabot security updates" + "Dependabot version updates" in repo settings, which triggered a wave of PRs. Triage by risk:

#### Group A: Safe to merge after a single Docker test pass
These are minor/patch bumps or grouped patches. Near-zero risk if tests stay green.

| PR | Description | Notes |
|---|---|---|
| #18 | npm-minor-patch group (8 packages batched) | The dependabot grouping config worked — 8 patches in one PR |
| #23 | ossf/scorecard-action 2.4.0 → 2.4.3 (gha-minor-patch group) | Patch bump to one of our own workflows |
| #28 | tar 7.4.3 → 7.5.13 | Same major version, includes security fixes |
| #29 | postcss 8.5.3 → 8.5.13 | Patch bumps with security fixes — likely the CVE Trivy flagged |
| #30 | rollup 4.36.0 → 4.60.2 | Same major (4.x), includes security fixes |
| #31 | svgo 3.3.2 → 3.3.3 | Patch |
| #32 | tar-fs 2.1.2 → 2.1.4 | Patch (security advisory) |

**Recommended approach:** check each PR's "Files changed" briefly to confirm no unexpected breaking changes mentioned in the changelog, then run the test suite once to verify, then merge. Could be batched together by manually rebasing them onto each other — but probably not worth the effort for ~7 PRs.

#### Group B: Action-major bumps (likely safe but verify)
Major version of GitHub Actions. Usually changelogs say "no breaking changes for typical use" but the test is the workflow run.

| PR | Description | Notes |
|---|---|---|
| #14 | actions/upload-artifact 4 → 7 | Used in `scorecard.yml` |
| #15 | actions/checkout 4 → 6 | Used in all 3 workflows |
| #16 | github/codeql-action 3 → 4 | Used in `codeql.yml`, `scorecard.yml`, `trivy.yml` (for SARIF upload) |

**Recommended approach:** check the action's release notes for breaking changes, then merge. The test is automatic — if the next workflow run fails, revert. Codex review optional — these are config-only changes.

#### Group C: Risky majors (need real evaluation)
Library major bumps that may have breaking changes affecting our code.

| PR | Description | Risk |
|---|---|---|
| #19 | tailwindcss 3 → 4 | **HIGH** — Tailwind 4 is a new engine with config migration. Dark mode + custom utilities behave differently. |
| #20 | uuid 9 → 14 | **MEDIUM** — likely ESM-only now; we use it in `bootstrap.js` and `users/index.js` |
| #21 | chokidar 3 → 5 | **MEDIUM** — used by `courseWatcher.js` (the file watcher); chokidar 4 had API changes |
| #22 | vitest 2 → 4 | **MEDIUM** — test infrastructure; vitest 3.x had config schema changes |
| #24 | better-sqlite3 9 → 12 | **HIGH** — native bindings; needs rebuild against the bundled Node version. Critical to our DB layer. |
| #25 | nuxt 3 → 4 | **VERY HIGH** — framework upgrade. Nuxt 4 stable but has migration steps; affects every page/component/server-route. Defer unless explicitly requested. |
| #26 | lru-cache 10 → 11 | **LOW** — used in `content/[...path].js` chunk cache. Probably fine. |
| #27 | minimatch | **MEDIUM** — security advisory but minimatch 5+ has API changes; check what depends on it (likely a transitive) |

**Recommended approach:**
- **Defer Nuxt 4 (#25)** — that's its own multi-day slice; do separately or never
- **Defer better-sqlite3 (#24)** — needs native rebuild verification across CI/test/manual stacks; high blast radius
- **Defer Tailwind 4 (#19)** — UI regression risk is real; entire frontend visual would need a careful review
- **Tackle the rest** one by one with full Docker test pass after each merge

### Group 2: CodeQL findings (7 total)

In the Security tab. Three actionable warnings + four cleanup notes.

#### Warnings (worth fixing)

1. **`js/file-system-race`** — `frontend/server/utils/courseWatcher.js:59` — TOCTOU race between `existsSync` (or similar) and a subsequent file read. Same pattern Codex flagged for `/api/logo` and `/api/login-banner` last round but in the watcher. Fix: wrap the read in a try/catch and treat ENOENT as "file gone, skip" rather than checking-then-reading.

2. **`js/superfluous-trailing-arguments`** — `frontend/server/utils/courseWatcher.js:199, :207` — function calls with extra args silently discarded. Could be a typo where the dev meant a different function or different argument. Read both lines, decide if the args were intended to do something (in which case the call is wrong) or are leftover from a refactor (in which case remove them).

#### Notes (cleanup-tier)

3. **`js/unused-local-variable`** in 4 places:
   - `frontend/tests/unit/sessions.test.js:7`
   - `frontend/tests/e2e/admin-panel.spec.js:217`
   - `frontend/tests/e2e/branding-runtime-env.spec.js:13`
   - `frontend/server/api/users/index.js:5` — likely a leftover import after the registration-lock work

   Trivial to remove. Could batch all 4 into a single "cleanup: unused vars" commit.

### Group 3: Trivy findings (~71 — most are noise; ~3 real)

Trivy reports on every config file pattern. Most are stylistic (run-as-non-root nags on Dockerfile.prod, etc.). Real CVEs:

- **MEDIUM**: `yaml` 2.7.0 → CVE-2026-33532 (fix: 2.8.3) — likely included in PR #18 npm-minor-patch group
- **LOW × 2**: `vite` 6.2.2 → CVE-2025-58751 + CVE-2025-58752 (fix: 6.3.6+) — likely included in PR #18 too

After merging the Dependabot PRs, re-run Trivy and most npm CVEs should clear. Re-check the Trivy alerts list after each Dependabot PR merge.

The Dockerfile config nits (USER directive, healthcheck, etc.) are out of scope for this round — they're real but homelab-acceptable. Could be a separate "Dockerfile hardening" slice if anyone cares.

### Group 4: Scorecard findings (22 — mostly defensible to ignore)

OSSF Scorecard wants:
- All actions pinned by commit SHA, not version tag (PinnedDependencies)
- Branch protection rules on main
- Required code review
- Token permissions set explicitly per workflow

For a solo homelab project, these are best-practice for big OSS projects but overkill here. **Defensible to leave as-is** unless you want a higher Scorecard score for vanity. If you do want them:
- Pinning by SHA: defeats Dependabot's auto-update value. Trade-off.
- Branch protection: requires GitHub plan that allows it on private repos (free for public, which you are)
- Code review: solo dev — n/a

### Out of scope

Not on the wishlist; only revisit if the user asks:
- Multi-tenant / multi-org auth
- OAuth / SSO  
- 2FA
- Public-internet-grade hardening
- Nuxt 4 migration (major framework upgrade — separate multi-day slice)

---

## How to start the next round

1. **Read [notes/handover.md](handover.md)** — this doc. You're here.
2. **Read [notes/feature-wishlist.md](feature-wishlist.md)** — the locked design doc for the original wishlist. Most of it is shipped now; remaining items: **B. Course content polish** (`course.json`, SRT→VTT, per-lesson README) and **D. Deferred quality items**.
3. **Read [notes/architecture-map.md](architecture-map.md)** — implementation map. Where things live. Caveat: written before the last several rounds of work; stale on auth + branding details but accurate on the broader structure.
4. **Confirm green starting state**:
   ```
   docker compose -f docker-compose.test.yml run --rm --build tests
   ```
   Should print 80 vitest + 103 Playwright passed. If not — investigate before doing anything else.
5. **Wait for the user's first message** to pick the slice. The most likely picks:
   - "Triage the Dependabot PRs" — start with Group A (safe), then B (action majors), then individual C items
   - "Fix the CodeQL warnings" — `courseWatcher.js` race + superfluous args + 4 unused vars (could be one small slice)
   - "Move on to course content polish (B)" — handover-recommended slice from the original wishlist; ignores the open Dependabot/CodeQL backlog
6. **Don't assume** — wait for direction.

---

## Workflow per change (carry-over from previous handover)

Same flow that got us here:

1. **Branch off `origin/main`**: `git checkout -b <name> origin/main`
2. **Brainstorm if creative work** — invoke `superpowers:brainstorming` skill. Skip if the user explicitly says "quick in place".
3. **Plan if non-trivial** — invoke `superpowers:writing-plans` after brainstorm. Skip for one-line fixes.
4. **Execute via subagents if multi-task** — `superpowers:subagent-driven-development`. For one-shot edits, do inline.
5. **Test in Docker** between every meaningful change.
6. **Codex review for non-trivial changes** before commit. Bash invocation only.
7. **Push + PR + merge** when green. Use `gh pr merge <N> --merge --delete-branch` (the local-checkout error from `gh` is expected because main is in the other worktree at `E:/skillgoblin/`; the GitHub-side merge succeeds despite the error).
8. **Cleanup after merge**: detach this worktree (`git checkout --detach`), delete the merged local branch (`git branch -D <name>`), update main in `E:/skillgoblin` (`git -C E:/skillgoblin pull --ff-only origin main`), then start the next slice from a fresh `git checkout -b ... origin/main`.

---

## Local environment

### Manual-test stack
`docker-compose.manual.yml` (untracked) runs a fresh-install instance for visual testing on port 3001. Admin: `admin` / `ChangeMe2026!`. Sandbox at `manual-test/data/`. Reset to fresh-install: `docker compose -f docker-compose.manual.yml down && rm -rf manual-test/data/database/* && docker compose -f docker-compose.manual.yml up --build -d`.

The manual stack mounts `./manual-test/data/branding:/app/data/branding` so you can drop test logos/banners in there to verify branding overrides.

### Worktree state
Work has been happening in a worktree at `E:/skillgoblin/.claude/worktrees/suspicious-kepler-7d7725/` (the previous one at `wizardly-cohen-224f57/` is still around but on detached HEAD). The main repo is at `E:/skillgoblin/`. The `gh pr merge` flow errors with `'main' is already used by worktree at E:/skillgoblin` — that's expected; the merge succeeds server-side despite the error. After merge, sync `E:/skillgoblin`'s main with `git -C E:/skillgoblin pull --ff-only origin main`.

### Codex setup
- Plugin at `C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/`
- Auth: already done. If `codex --version` says `unauthenticated`, run `codex login`.

### Lockfile changes (Dependabot will produce them)
If you bump a frontend dep, regenerate the lockfile *inside Docker* (host build is broken):
```
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W)/frontend:/work" -w "//work" node:18-alpine \
  sh -c "npm install --package-lock-only --no-audit --no-fund"
```
Dependabot updates the lockfile in its PRs automatically — no action needed unless you bump deps yourself.

---

## Architectural cheat sheet (60-second version)

- **Stack:** Nuxt 3 (SSR off — pure SPA), Tailwind 3, Vue 3 composition API, better-sqlite3 SQLite.
- **Auth:** `sg_session` cookie (HttpOnly, SameSite=Lax, 30-day) issued by `/api/users/auth`. Server middleware [session.js](frontend/server/middleware/session.js) reads it, populates `event.context.user`, slides expiry forward (debounced 5 min). Skips cookie processing for `/api/content/`, `/api/course-thumbnail/`, `/api/random-banner`, `/api/logo`, `/api/login-banner`, `/api/webmanifest`, `/_nuxt/`, `/favicon`, `/banners/`, `/images/`, `/logos/` so those endpoints can be publicly cached without leaking Set-Cookie.
- **Authz:** every mutating endpoint calls `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` from [authz.js](frontend/server/utils/authz.js). Static rule: no caller can act on someone else unless admin; mutations of role / activation are admin-only. The single exception is `POST /api/users` which gates on `system_settings.allow_user_registration` instead.
- **Credentials:** argon2id. Legacy plaintext detected on read and rehashed inline.
- **Branding:** env vars read at server startup via `frontend/scripts/entrypoint.sh` mapping `APP_*` → `NUXT_PUBLIC_BRANDING_*`. Nuxt's runtimeConfig populates `runtimeConfig.public.branding` which `app.vue` consumes via `useHead`. `/api/webmanifest` reads `process.env` directly via `readBranding()`.
- **First-run:** server plugin [bootstrap.js](frontend/server/plugins/bootstrap.js) refuses to start on a fresh install if `ADMIN_NAME` / `ADMIN_PASSWORD` env aren't set. Same plugin warns about invalid `APP_THEME_COLOR` / `APP_BACKGROUND_COLOR` hex values.
- **Migrations:** numbered, forward-only, in `frontend/server/migrations/`. Latest is `003_allow_user_registration.js`. Manifest in `index.js`.

---

## Recommended starting slice (for whoever picks up)

If the user is open to a recommendation: **Group A (safe Dependabot PRs) + the CodeQL cleanup notes**. Both are low-effort, both clear real items off the security backlog, both use the existing test infrastructure, no new design needed. After that, the action-major Dependabot PRs (Group B) are also cheap.

The juicy stuff (course content polish, the Nuxt 4 / Tailwind 4 / better-sqlite3 majors) is real work and warrants its own brainstorm-design-plan-execute slice.

But that's a recommendation, not a decision — wait for the user's pick.
