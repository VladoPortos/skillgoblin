# Handover — picking up after the Nuxt 4 + Tailwind 4 migration + native-deps sweep

You are starting a fresh session. The previous session(s) shipped both halves of the major-framework migration plus the safe native-module bumps from the open dependabot group. Tests still green: 98 vitest + 103 Playwright. Main on commit `999e5f0`.

The user's first message after `/clear` will tell you what to work on next. Until then: read this doc, wait for direction.

---

## TL;DR

- **Repo:** SkillGoblin — self-hosted homelab learning platform. **Nuxt 4.x + Tailwind 4.x** + better-sqlite3 12.x SQLite + argon2 0.44 + sharp 0.34 + Playwright 1.59.1. SPA mode (`ssr: false`). Designed for trusted local networks.
- **State of `main`:** auth + admin + branding + UI polish + CI + .gitattributes-locked LF + Node 20 + 22 patch/minor bumps + Nuxt 4 + Tailwind 4 (CSS-first via `@tailwindcss/vite`) + argon2/beanheads-vue/sharp + Playwright 1.59 (with the docker test service renamed `app` → `web` to dodge the `.app` HSTS preload) shipped.
- **What's open: 0 PRs** at the time this doc was written. First time the queue is fully drained.
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

## What shipped this session — Nuxt 4 + Tailwind 4 migration

Two PRs in sequence, both green on Docker, both visually verified by the user.

### Phase A — Nuxt 3.16 → 4.x ([PR #57](https://github.com/VladoPortos/skillgoblin/pull/57), merge sha `9c83671`)

- `nuxt ^3.9.0` → `^4.0.0` in `package.json` + regenerated `package-lock.json` (786 packages on Node 20)
- **Replaced `window.__NUXT__` test access** in `frontend/tests/e2e/branding-runtime-env.spec.js` — Nuxt 4 deletes that global post-hydration. Now asserts on rendered `<title>` + `<meta name="description">` + `<meta name="theme-color">` (all driven by `app.vue`'s `useHead()` reading from `runtimeConfig.public.branding`)
- **Dropped the dead local `navigateTo` helper** in `frontend/pages/courses/[id].vue` (had zero callers; would have been auto-import-shadowed in Nuxt 4)
- **`process.client` → `import.meta.client`** across 6 occurrences (Nuxt 4 idiom; old form still works as a deprecated alias)
- **Added `frontend/.npmrc` with `legacy-peer-deps=true`** + extended `Dockerfile.prod`'s `COPY` to include it. Reason: Nuxt 4 pulls `@bomb.sh/tab` which declares `commander@^13.1.0` as an *optional* peer; svgo in parallel pulls `commander@^11`. Without `legacy-peer-deps`, `npm ci` fails the lockfile-vs-tree consistency check despite the `optional: true` flag. **This is a critical compatibility fix — don't remove it.**
- We did NOT migrate to Nuxt 4's new `app/` directory layout. Flat-structure auto-detect works and the move is mechanical churn for ~zero benefit on this SPA. Can be done in a future cleanup PR if ever desired.

### Phase B — Tailwind 3.4 → 4.x ([PR #60](https://github.com/VladoPortos/skillgoblin/pull/60), merge sha `876fd03`)

- **Switched to `@tailwindcss/vite` plugin** (Tailwind team's official Nuxt path per their docs) instead of `@nuxtjs/tailwindcss` v7 — v7 of the bridge module is still in beta only as of 2026-05-04 (`7.0.0-beta.0` / `7.0.0-beta.1`). The `@tailwindcss/vite` path is officially supported and stable. Removed `@nuxtjs/tailwindcss`, `postcss`, and `autoprefixer`.
- **CSS-first config** in new `frontend/assets/css/tailwind.css`:
  ```css
  @import "tailwindcss";
  @plugin "@tailwindcss/forms";
  @variant dark (.dark &);
  @theme { ...primary palette + ring overrides... }
  @layer base { *, ::before, ::after { border-color: ... } }
  ```
  Deleted `frontend/tailwind.config.js`.
- **Decisions 3+4 applied as global overrides** so we didn't need per-occurrence rewrites:
  - `--default-ring-width: 3px` + `--default-ring-color: var(--color-blue-500)` (preserves v3 ring default)
  - Border `gray-200` default in `@layer base` (preserves v3 border default)
- **Decision 2 outline-none audit**: NO-OP. All 14 occurrences are already paired with `focus:ring-*`. Kept as plain v4 `outline-none`. Did NOT blanket-replace with `outline-hidden` (that would have hidden focus indicators visually for screen readers).
- **Utility renames** (~40 sites across 12 files):
  - `bg-{color} bg-opacity-N` → `bg-{color}/N` (15 sites)
  - `focus:ring-{color} focus:ring-opacity-N` → `focus:ring-{color}/N`
  - `hover:bg-opacity-90` → `hover:opacity-90` (CategoryFilterBar — different effect, same intent)
  - `flex-shrink-0` → `shrink-0` (4 sites)
  - `shadow-sm` → `shadow-xs` (15 sites)
  - bare `shadow` → `shadow-sm` (5 sites)
- **`@reference "../assets/css/tailwind.css";`** added to `frontend/components/CourseFilesModal.vue` (the only Vue file in the codebase using `@apply` in a scoped style — Tailwind 4 needs this to resolve utility names from outside the file)

Net deps: 786 → 661 packages.

---

## What's left — 2 open PRs (both fresh dependabot, unrelated to the migration)

- [#58](https://github.com/VladoPortos/skillgoblin/pull/58) `@playwright/test` + `playwright` group bump — easy, just merge after rebase
- [#59](https://github.com/VladoPortos/skillgoblin/pull/59) npm-minor-patch group — 4 updates, regenerated by dependabot after Phase A merged. Run the standard "rebase + merge + verify on main" loop from the workflow section below.

---

## Lessons learned this session (READ BEFORE doing similar work)

### 1. `@nuxtjs/tailwindcss` v7 is still beta-only — go straight to `@tailwindcss/vite`
The plan recommended `@nuxtjs/tailwindcss` v7 as the conservative path, but `npm view @nuxtjs/tailwindcss versions` showed only `7.0.0-beta.0` and `7.0.0-beta.1`. The `@tailwindcss/vite` plugin is the Tailwind team's official Nuxt path (per their docs at https://tailwindcss.com/docs/installation/framework-guides/nuxt) and is stable. It's also a cleaner setup: drop `@nuxtjs/tailwindcss`/`postcss`/`autoprefixer`, register the plugin in `nuxt.config.js`'s `vite.plugins`, point `css:` at the entry file. CSS-first config in `assets/css/tailwind.css` replaces `tailwind.config.js`.

### 2. Nuxt 4's optional peer deps break `npm ci` without `legacy-peer-deps=true`
`@bomb.sh/tab@0.0.14` declares `commander@^13.1.0` as a `peerDependenciesMeta.commander.optional: true` peer. svgo in the same tree pulls `commander@^11.1.0`. `npm install` resolves cleanly (it respects the optional flag), but `npm ci` checks lockfile-vs-tree consistency and rejects the install with `Invalid: lock file's commander@11.1.0 does not satisfy commander@13.1.0`. Fix: `frontend/.npmrc` with `legacy-peer-deps=true` AND extend `Dockerfile.prod`'s `COPY` so the `.npmrc` reaches the build context (otherwise the prod build still fails). Test runner picks `.npmrc` up automatically since it mounts `frontend/` as `/work`.

### 3. `@apply` in Vue scoped styles needs `@reference` in Tailwind 4
Tailwind 4's PostCSS-replacement compiler can't resolve utility names that come from outside the file being compiled. So `<style scoped>` blocks using `@apply dark:bg-gray-800` fail with `Cannot apply unknown utility class \`dark:bg-gray-800\``. Fix: add `@reference "../assets/css/tailwind.css";` (path relative to the file's location, not project root) at the top of the `<style scoped>` block. Only one Vue file uses `@apply` in our codebase (`components/CourseFilesModal.vue`), so this was a one-line fix — but it's a footgun for any future `@apply` usage.

### 4. `sed -E 's/(\b)shadow(\b)([^-])/.../'` for bare-utility renames catches CSS properties
Renaming bare Tailwind `shadow` → `shadow-sm` looks like a clean word-boundary problem, but the regex `\bshadow\b[^-]` matches inside `box-shadow: ...` (because `:` isn't a hyphen) and inside `transition-shadow ` (because both `shadow` boundaries are preserved). My first run silently produced `box-shadow-sm: 0 4px ...` and `transition-shadow-sm` across 5 files. **Always run a `grep -rEn 'box-shadow|transition-shadow|drop-shadow' --include="*.vue" .` after a bare-utility rename and confirm no compound utilities or CSS properties got caught.** Recovery is a targeted reverse-sed for each compound (`box-shadow-sm: → box-shadow:`, `transition-shadow-sm → transition-shadow`).

### 5. Don't name a docker service after a hostname Chromium has HSTS-preloaded (`.app`, `.dev`, `.foo`, `.page`, …)
**This bit hard.** When [#58](https://github.com/VladoPortos/skillgoblin/pull/58) bumped `@playwright/test` from 1.48 to 1.59 (and the docker image to match), 46 of 103 Playwright tests started failing with `Error: page.goto: net::ERR_SSL_PROTOCOL_ERROR at http://app:3000/...`. Chromium was forcing HTTPS on every browser-driven navigation, even though `page.request.*` (raw HTTP, no browser) worked fine.

We initially blamed Chrome 141's auto-HTTPS-upgrade feature and tried every disable-flag we could find:

```js
launchOptions: {
  args: [
    '--test-type',
    `--unsafely-treat-insecure-origin-as-secure=${baseURL}`,
    '--disable-features=HttpsUpgrades,HttpsFirstBalancedMode,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeIncognito,HttpsFirstModeV2'
  ]
}
```

None of them worked. That was the clue.

**Real cause:** the docker test service was named `app`. Chromium's HSTS preload list hardcodes the `.app` gTLD as HTTPS-only (Google bought `.app` and registered it that way in 2018; same applies to `.dev`, `.foo`, `.page`, `.new`, `.search`, `.zip`, `.mov`). Every host on those TLDs — including the bare label `app` resolving via docker DNS — gets HTTPS forced. **Hardcoded HSTS preloads are a security guarantee, not a feature flag** — there is no Chromium command-line argument that disables them. Workarounds like `--unsafely-treat-insecure-origin-as-secure` don't bypass the preload because the preload kicks in earlier in the request lifecycle.

**Fix:** rename the docker service to a label outside any preloaded TLD. We picked `web`. Two-line change in `docker-compose.test.yml` (service name + `PW_BASE_URL`) plus updating the hardcoded fallback in `frontend/playwright.config.js` and the eight `tests/e2e/*.spec.js` files that copy-paste the same fallback. Once renamed, Playwright 1.59 + Chrome 141 work without any flags. Shipped in the same commit as the bump.

For future you: if a Playwright/Chrome bump suddenly starts failing browser navigations with SSL errors on a hostname that previously worked, **check the HSTS preload list before fighting flags**. The list lives at https://chromium.googlesource.com/chromium/src/+/main/net/http/transport_security_state_static.json. Single-label hosts are matched against it just like full domains are.

---

## How to start the next round

1. **Read [notes/handover.md](handover.md)** — this doc. You're here.
2. **Optional reads:**
   - [notes/feature-wishlist.md](feature-wishlist.md) — original wishlist; most shipped
   - [notes/architecture-map.md](architecture-map.md) — implementation map. Stale on auth + branding details (predates Phase 1) but accurate on overall structure.
3. **Confirm green starting state**:
   ```
   docker compose -f docker-compose.test.yml run --rm --build tests
   ```
   Should print 11 vitest files / 98 tests + 103 Playwright passed. If not — investigate before doing anything else.
4. **Wait for the user's first message** to pick the slice. Likely picks:
   - **A new feature** — course content polish, fresh capability, etc.
   - **Triage any new dependabot PRs that landed since the sweep.**
5. **Don't assume** — wait for direction.

---

## Workflow per change (proven across two sessions)

For Dependabot PRs:
1. **Trigger rebase**: `gh pr comment <N> --body "@dependabot rebase"`
2. **Poll mergeable**: 30s typical
3. **Merge via gh** (DON'T checkout locally first): `gh pr merge <N> --merge --delete-branch`
4. **Sync main**: `git fetch origin main && git checkout --detach origin/main && git -C E:/skillgoblin pull --ff-only origin main`
5. **Test on main**: full Docker test pass
6. **If broken: `git revert -m 1 <merge-sha>`** as a new PR ([#51](https://github.com/VladoPortos/skillgoblin/pull/51) is the template from the nitropack break in the dependency-cleanup session)

For our own work (cleanups, features, future migrations):
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

### Lockfile changes
**Don't regenerate manually unless deps changed** — for Dependabot PRs the lockfile is already updated in the PR; `gh pr merge` works as long as `npm ci` accepts the lockfile. If we ever need to bump deps ourselves:
```
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(pwd -W)/frontend:/work" -w "//work" node:20-alpine \
  sh -c "npm install --no-audit --no-fund"
```
**Caveat:** the rollup optional-deps issue may bite. If `npm ci` fails on `@rollup/rollup-linux-x64-gnu`, switch the regen image from `node:20-alpine` to `node:20-slim` (Debian, not Alpine) so the lockfile picks up both musl and gnu rollup binaries.

---

## Architectural cheat sheet (60-second version)

- **Stack:** Nuxt 4.x (SSR off — pure SPA), Tailwind 4.x via `@tailwindcss/vite` (CSS-first config in `frontend/assets/css/tailwind.css`), Vue 3 composition API, better-sqlite3 12.x SQLite. Node 20.
- **Auth:** `sg_session` cookie (HttpOnly, SameSite=Lax, 30-day) issued by `/api/users/auth`. Server middleware [session.js](frontend/server/middleware/session.js) reads it, populates `event.context.user`, slides expiry forward (debounced 5 min). Skips cookie processing for `/api/content/`, `/api/course-thumbnail/`, `/api/random-banner`, `/api/logo`, `/api/login-banner`, `/api/webmanifest`, `/_nuxt/`, `/favicon`, `/banners/`, `/images/`, `/logos/` so those endpoints can be publicly cached without leaking Set-Cookie.
- **Authz:** every mutating endpoint calls `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` from [authz.js](frontend/server/utils/authz.js). Static rule: no caller can act on someone else unless admin; mutations of role / activation are admin-only. The single exception is `POST /api/users` which gates on `system_settings.allow_user_registration` instead.
- **Credentials:** argon2id. Legacy plaintext detected on read and rehashed inline.
- **Branding:** env vars read at server startup via `frontend/scripts/entrypoint.sh` mapping `APP_*` → `NUXT_PUBLIC_BRANDING_*`. Nuxt's runtimeConfig populates `runtimeConfig.public.branding` which `app.vue` consumes via `useHead`. `/api/webmanifest` reads `process.env` directly via `readBranding()`.
- **First-run:** server plugin [bootstrap.js](frontend/server/plugins/bootstrap.js) refuses to start on a fresh install if `ADMIN_NAME` / `ADMIN_PASSWORD` env aren't set. Same plugin warns about invalid `APP_THEME_COLOR` / `APP_BACKGROUND_COLOR` hex values.
- **Tailwind:** Tailwind 4 entry point is `frontend/assets/css/tailwind.css`. All custom config (primary palette, dark variant, ring/border defaults) lives in there as `@theme`/`@plugin`/`@variant`/`@layer base` blocks — no `tailwind.config.js`. Vue scoped styles using `@apply` need `@reference "../assets/css/tailwind.css";` at the top of the `<style scoped>` block.
- **Migrations:** numbered, forward-only, in `frontend/server/migrations/`. Latest is `003_allow_user_registration.js`. Manifest in `index.js`.
