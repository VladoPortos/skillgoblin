# Nuxt 4 + Tailwind 4 Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends with a Docker test pass — do not advance with red tests.

**Goal:** Land Nuxt 3.16.1 → 4.x and Tailwind 3.4 → 4.x in a single user-driven session, in two sequential PRs (Nuxt first, Tailwind second), each with a Docker test pass + visual verification before merging. Side effects expected: closes [#19](https://github.com/VladoPortos/skillgoblin/pull/19), [#25](https://github.com/VladoPortos/skillgoblin/pull/25), and [#50](https://github.com/VladoPortos/skillgoblin/pull/50) (the broken `@nuxtjs/tailwindcss 6.14.0` group).

**Are they codependent?** **No, they are not strictly codependent.** Nuxt 4 works with Tailwind 3 (via `@nuxtjs/tailwindcss` v6.x). Tailwind 4 works with Nuxt 3 (via `@nuxtjs/tailwindcss` v7 or `@tailwindcss/vite`). But:
- The user has to do a visual review for Tailwind 4 anyway (utility renames change rendering subtly). Doing it on Nuxt 3 means re-verifying after Nuxt 4 — duplicate work.
- The `@nuxtjs/tailwindcss 6.14.0` build break (PR #50) is downstream of a globby ESM/CJS chain that Nuxt 4's loader handles differently; Nuxt 4 + the matched `@nuxtjs/tailwindcss` v7 sidesteps this entirely.
- Doing both in one session lets the user do **one comprehensive visual review** at the end.

So the recommendation is **same session, two PRs, Nuxt first**.

---

## Pre-flight checklist (before first commit)

- [ ] Local main + worktree synced and clean. Tests green: `docker compose -f docker-compose.test.yml down -v && docker compose -f docker-compose.test.yml run --rm --build tests` → 98 vitest + 103 Playwright.
- [ ] User has time for one ~3-hour focused session (the visual review is the long pole).
- [ ] Backup of `frontend/` available (this is a multi-file mechanical change; reversion via `git revert` is the primary safety net but worktree backup is cheap insurance).
- [ ] Manual-test stack ready (`docker-compose.manual.yml`) for visual checks. Reset to fresh-install: see [handover.md](handover.md).

---

## Phase A — Nuxt 3 → 4

**Branch:** `chore/nuxt-4-upgrade`

### Codebase impact summary

| Concern | Affected files | Severity |
|---|---|---|
| Directory structure (new `app/` default) | All of `frontend/` — but **backward-compat works** if we don't move things | LOW (skip the move) |
| `useHead` (Unhead v2) | `frontend/app.vue:17` — uses `title` + `meta` only, no removed props (`vmid`, `hid`, `children`, `body`) | NONE |
| `useAsyncData` / `useFetch` | **Not used at all** — we use `$fetch` directly | NONE |
| `definePageMeta` | `frontend/pages/courses/index.vue:310`, `frontend/pages/courses/[id].vue:130` | LOW (API unchanged) |
| `defineNuxtRouteMiddleware` + `navigateTo` | `frontend/middleware/auth.js` | LOW (API unchanged) |
| `process.client` (deprecated alias) | `frontend/app.vue:33`, `frontend/composables/useTheme.js` x4, `frontend/composables/useUserManagement.js:259` | LOW — still works in Nuxt 4 but `import.meta.client` is preferred. Optional cleanup. |
| Local `function navigateTo` shadowing Nuxt's auto-import | `frontend/pages/courses/[id].vue:489` | MEDIUM — rename to avoid auto-import conflicts |
| `window.__NUXT__` access | `frontend/tests/e2e/branding-runtime-env.spec.js:23-26` — **WILL BREAK** (deleted post-hydration in Nuxt 4) | **HIGH** — test must be rewritten |
| `@nuxtjs/tailwindcss` v6.x (used now) | `frontend/nuxt.config.js:18` | NONE in this phase (we keep Tailwind 3 here, just bump Nuxt) |
| Server middleware/plugins (Nitro) | `frontend/server/plugins/bootstrap.js`, `branding.js`; `frontend/server/middleware/cache-control.js`, `session.js` | LOW — Nitro 2.12 was the issue (PR #34); Nuxt 4 ships with a Nitro version that's actually compatible by design |

### Strategic decision: **don't migrate to the new `app/` directory**

Nuxt 4 auto-detects existing flat structure. Moving 20+ files into `app/` is mechanical churn for ~zero benefit on a SPA project this size. Skip the move. We can do it in a separate cleanup PR if ever desired.

### Tasks

#### A1: Run automated upgrade
- [ ] Branch off main: `git checkout -b chore/nuxt-4-upgrade origin/main`
- [ ] Run codemod inside Docker:
  ```
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$(pwd -W)/frontend:/work" -w "//work" node:20-alpine \
    sh -c "npm i -D codemod && npx codemod@latest nuxt/4/migration-recipe --no-install"
  ```
  This applies file-structure tweaks, dedupe value updates, default-value updates, etc. Note: we expect minimal changes since most codemods target patterns we don't use.
- [ ] Bump nuxt: edit `frontend/package.json` `nuxt` from `^3.9.0` to `^4.0.0` (or `^4.4.0` to match the open PR target). Same for `@nuxtjs/tailwindcss` — keep `^6.x` for now (Tailwind 3 still in use this phase).
- [ ] Regenerate lockfile inside Docker:
  ```
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$(pwd -W)/frontend:/work" -w "//work" node:20-alpine \
    sh -c "npm install --no-audit --no-fund"
  ```
  **Caveat:** the rollup optional-deps issue we hit on lru-cache may resurface. If `npm ci` fails on `@rollup/rollup-linux-x64-gnu`, run `npm install` once more (which adds optional deps based on platform) — node:20-alpine is glibc-incompatible, so the `tests` Playwright runner (jammy/Ubuntu) needs the gnu binary too. If this bites, switch the regen to `node:20-slim` Docker image (Debian, not Alpine) which produces a lockfile with both musl and gnu rollup binaries.
- [ ] Commit lockfile + package.json bump as `chore: bump nuxt 3.16 -> 4.x`.

#### A2: Fix the `window.__NUXT__` test (the only known-breaking change)
- [ ] Edit `frontend/tests/e2e/branding-runtime-env.spec.js`. The current test reads `window.__NUXT__.config.public.branding` post-hydration. In Nuxt 4, `__NUXT__` is deleted after hydration. Replacement: read the rendered output directly. Two options:
  - **Option 1 (preferred):** assert that the page `<title>` matches `APP_NAME` from env (this is what `useHead` writes). The test is "runtime config reaches the client" — title is the most visible proof.
  - **Option 2:** expose runtime config via a `<meta>` tag in `app.vue` (`<meta name="sg-app-name" :content="branding.name">`) and assert from that.
- [ ] Update the test to use Option 1 unless Option 2 is required for any other test. Re-run e2e suite locally to confirm.
- [ ] Commit as `fix(test): replace window.__NUXT__ access with rendered-output assertion`.

#### A3: Rename local `navigateTo` shadowing
- [ ] In `frontend/pages/courses/[id].vue:489`, rename `function navigateTo(path)` to `function goToCourse(path)` (or similar). Update its caller(s) on the same page.
- [ ] No external usage — this is a local Vue function, not exported.
- [ ] Commit as `refactor: rename local navigateTo helper to avoid Nuxt auto-import conflict`.

#### A4: Optional `process.client` → `import.meta.client` cleanup (skip if low energy)
- [ ] Replace 6 occurrences of `process.client` with `import.meta.client`:
  - `frontend/app.vue:33`
  - `frontend/composables/useTheme.js:10, :55, :65, :100`
  - `frontend/composables/useUserManagement.js:259`
- [ ] Both forms work in Nuxt 4; this is purely future-proofing for Nuxt 5.
- [ ] Commit as `chore: prefer import.meta.client over process.client (Nuxt 4 idiom)`.

#### A5: Verify + ship
- [ ] Full Docker test pass: 98 vitest + 103 Playwright must be green.
- [ ] Manual-test smoke: bring up `docker-compose.manual.yml`, log in as admin, click through Courses → Course detail → Admin Panel → My Profile. Watch the dev tools console for hydration warnings or Nuxt-version mismatches.
- [ ] Push branch, open PR, merge.

---

## Phase B — Tailwind 3 → 4

**Branch:** `chore/tailwind-4-upgrade`

### Codebase impact summary

Counts from automated grep:

| Pattern | Occurrences | Action |
|---|---|---|
| `bg-opacity-*` | 13 | Replace with `bg-color/N` opacity modifier (`bg-black/50`) |
| `flex-shrink-*` | 4 | Rename to `shrink-*` |
| `shadow-sm` | 15 | Renamed in v4: was `shadow-sm`, becomes `shadow-xs`. **And** the bare `shadow` becomes `shadow-sm`. Net: `shadow-sm` and `shadow` both rotate. |
| `shadow ` (bare) | 2 | Rename to `shadow-sm` |
| `rounded ` (bare) | 35 | Rename to `rounded-sm` (and any explicit `rounded-sm` → `rounded-xs` — but we have 0 of those) |
| `outline-none` | 14 | **Semantics changed**: in v4 `outline-none` sets `outline-style: none` (visible to screen readers). To preserve v3 behavior (visually hidden focus ring) use `outline-hidden`. Audit context per-occurrence. |
| `ring` (bare) | 26 | Default ring width changed 3px → 1px and color blue-500 → currentColor. To preserve v3 behavior, use `ring-3` and add an explicit `ring-color` class. |
| `bg-[--var]` arbitrary | grep'd 0 in last audit | n/a (was config-only via runtimeConfig) |
| `*:first:`, `first:*:` etc | manually verify | rare in our codebase, but check |
| `!utility` important syntax | manually verify | grep showed only `!variable` (JS), not Tailwind `!utility` |
| `[max-content,auto]` comma syntax in arbitrary values | manually verify | unlikely |

**~110+ class instances to update** mechanically. The `@tailwindcss/upgrade` codemod handles the bulk of this automatically.

### Tailwind config impact

| Item | Action |
|---|---|
| `darkMode: 'class'` (in `tailwind.config.js`) | v4 still supports class-based dark mode but config moves to CSS: `@variant dark (.dark &);` in the main CSS file. The codemod handles this. |
| Custom `primary` palette (50-950) | Migrate from JS object → CSS `@theme` variables (`--color-primary-50`, `--color-primary-100`, ...) |
| `@tailwindcss/forms` plugin | Still works in v4 but loaded differently — registered in the CSS file via `@plugin "@tailwindcss/forms";` |
| `content: [...]` glob list | v4 auto-detects content; can drop the array |
| `tailwind.config.js` itself | Not auto-loaded in v4. Either delete it (move all config to CSS) or keep it and load explicitly via `@config "../../tailwind.config.js";` in the main CSS. **Recommended: delete it and migrate to CSS-first config.** |

### Build pipeline impact

| Item | Action |
|---|---|
| `@nuxtjs/tailwindcss` v6.x → **v7** | Bump in `package.json`. v7 was merged 2025-05-24 (PR [#991](https://github.com/nuxt-modules/tailwindcss/pull/991)) and supports Tailwind 4. |
| `postcss` + `autoprefixer` direct deps | **Drop both.** Tailwind 4 handles vendor prefixes internally (Lightning CSS). |
| `@tailwind base/components/utilities` directives | Replace with single `@import "tailwindcss";` |
| Browser support floor | Safari 16.4+, Chrome 111+, Firefox 128+. **Confirm with user this is acceptable** — homelab project so likely fine, but worth flagging. |
| Vite plugin path (alternative) | `@tailwindcss/vite` is the Tailwind team's preferred Nuxt path per their official guide. v7 of the bridge module is the conservative path. **Recommended: stay on `@nuxtjs/tailwindcss` v7** for fewer config changes. |

### Tasks

#### B1: Run automated upgrade
- [ ] Branch off main: `git checkout -b chore/tailwind-4-upgrade origin/main`
- [ ] Run upgrade codemod inside Docker (Tailwind 4's tool is npm-based, needs Node 20+):
  ```
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$(pwd -W)/frontend:/work" -w "//work" node:20-alpine \
    sh -c "npx @tailwindcss/upgrade@latest --force"
  ```
  This:
  - Bumps tailwindcss to 4.x in `package.json`
  - Migrates `tailwind.config.js` → CSS-first config (likely produces an `app/assets/css/main.css` or similar)
  - Renames removed/renamed utilities across all `.vue` files
  - Drops `postcss-import` / `autoprefixer` from deps
  - Updates the PostCSS config or migrates to Vite plugin
- [ ] Review the codemod's diff carefully. The codemod is high-quality but not perfect. Specifically eyeball:
  - **Did the codemod blanket-replace `outline-none` → `outline-hidden`?** If yes — those replacements are NOT what we want per Decision 2. Revert them; we'll audit per-occurrence in B3.
  - Did it preserve the custom `primary` color palette as CSS variables?
  - Did `@tailwindcss/forms` get re-registered correctly?
- [ ] **Apply global decisions** — append to the main CSS file (likely `frontend/app/assets/css/main.css`):
  ```css
  /* Decision 3: preserve v3 ring defaults (3px width, blue-500 color) */
  @theme {
    --default-ring-width: 3px;
    --default-ring-color: var(--color-blue-500);
  }

  /* Decision 4: preserve v3 default border color (gray-200) */
  @layer base {
    *, ::after, ::before, ::backdrop, ::file-selector-button {
      border-color: var(--color-gray-200, currentColor);
    }
  }
  ```
- [ ] Commit codemod output + the two global overrides as `chore: tailwind 4 codemod output + ring/border default overrides`.

#### B2: Bump @nuxtjs/tailwindcss to v7
- [ ] Edit `frontend/package.json`: `@nuxtjs/tailwindcss` from `^6.8.0` to `^7.0.0` (or current latest `7.x`).
- [ ] Regenerate lockfile in Docker (same caveat about rollup optional-deps as Phase A1).
- [ ] Commit as `chore: bump @nuxtjs/tailwindcss 6 -> 7 for Tailwind 4 support`.

#### B3: Manual sweep — `outline-none` audit + codemod misses
- [ ] Search for any remaining v3-only patterns:
  ```
  cd frontend && grep -rEn '\b(bg-opacity-|text-opacity-|border-opacity-|flex-shrink-|flex-grow-)' components pages app.vue error.vue
  ```
  Fix any the codemod missed.
- [ ] **Per-occurrence `outline-none` audit (Decision 2)** — list all 14 occurrences:
  ```
  cd frontend && grep -rEn 'outline-none' components pages app.vue error.vue
  ```
  For each, classify and act:
  - **Has paired `focus:ring-*` or `focus-visible:ring-*` on the same element:** drop the `outline-none` (or keep as v4 plain `outline-none`). The ring is the a11y signal. Don't use `outline-hidden`.
  - **No paired focus indicator:** add one. Default pattern: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2`. Adjust ring color per design.
  - **Element is a non-interactive `<div>` with `outline-none` for some weird reason:** drop it entirely; non-interactive elements don't get focused.
- [ ] Ring 3px default is global (Decision 3) so we don't need to prepend `ring-3` per occurrence. Verify by visually checking a couple of focus states.
- [ ] Border color is global (Decision 4) so we don't need to chase `border-gray-200` everywhere.
- [ ] Commit per group as `style: handle Tailwind 4 codemod misses + outline-none a11y audit`.

#### B4: Test build + visual smoke
- [ ] Full Docker test pass: 98 vitest + 103 Playwright.
- [ ] **Visual review (this is where the user takes over):**
  - Bring up `docker-compose.manual.yml` fresh
  - Walk through every page: login screen, courses list, course detail, admin panel (users tab + settings tab + sessions drilldown), my profile editor, set-credentials modal, course editor
  - Check shadows on cards (should still look right after rotation)
  - Check rounded corners on buttons/cards (sm vs xs vs default rotation)
  - Check focus rings on all interactive elements (rings, outlines, buttons, links)
  - Check border colors on inputs/cards (default change `gray-200` → `currentColor` could surprise)
  - Check the AvatarSelector grid (lots of borders + shadows + focus states)
  - Check the random banner login screen (banner image + text overlay)
  - Check both light and dark theme (we have `darkMode: class`)
  - Watch dev tools console for any CSS warnings
- [ ] **At first sign of visual breakage:** comment which page + element + what looks wrong; we either patch or revert that specific class.
- [ ] If visual review passes: push branch, open PR, merge.

---

## Tail tasks (after both PRs merged)

- [ ] Re-check open PR list. [#19](https://github.com/VladoPortos/skillgoblin/pull/19), [#25](https://github.com/VladoPortos/skillgoblin/pull/25), [#50](https://github.com/VladoPortos/skillgoblin/pull/50) should auto-close when Dependabot detects target versions in main.
- [ ] If [#50](https://github.com/VladoPortos/skillgoblin/pull/50) doesn't auto-close (the broken `@nuxtjs/tailwindcss 6.14.0` group): comment that we've moved to v7, close manually.
- [ ] Update [handover.md](handover.md) — strike out Nuxt 4 / Tailwind 4 from "deferred majors" and replace with the "now on" entries.
- [ ] **Trivy / CodeQL re-scans** will pick up new transitive bumps. Watch the Security tab for ~24h for fresh items; most will be patches that fall into the "easy rebase" bucket from the prior round.

---

## Rollback

If something breaks beyond quick patching:
- **Phase A (Nuxt 4):** revert the merge commit on main with `git revert -m 1 <merge-sha>` — same pattern as the [#51](https://github.com/VladoPortos/skillgoblin/pull/51) revert of nitropack.
- **Phase B (Tailwind 4):** same. The PR is large but git tracks every line.
- **Both:** local backup of `frontend/` directory before starting (cheap insurance, but git revert is the real safety net).

The Nitropack revert pattern is well-tested. We've done it once successfully; the same playbook applies here if needed.

---

## Decisions (locked 2026-05-04)

1. **Browser support floor accepted** — Safari 16.4+ / Chrome 111+ / Firefox 128+. Homelab is fine.
2. **`outline-none`: fix properly per-occurrence, do NOT blanket-replace with `outline-hidden`.** The codemod's default mapping is to preserve old visually-hidden behavior — that's NOT what we want. For each of the 14 occurrences:
   - If it's paired with `focus:ring-*` (custom visible focus indicator already present): the ring IS the a11y signal. Drop the `outline-none` entirely OR keep it as plain v4 `outline-none` (no outline, screen-readable). Both are accessible.
   - If it's NOT paired with any focus indicator: that's a pre-existing a11y bug. Add `focus-visible:ring-2 focus-visible:ring-primary-500` (or similar) to give it one.
   - Goal: every interactive element has a visible focus state when keyboard-focused. No bare `outline-hidden`.
3. **Ring width: preserve 3px globally.** Add to the main CSS file:
   ```css
   @theme {
     --default-ring-width: 3px;
     --default-ring-color: var(--color-blue-500);
   }
   ```
4. **Border color: preserve `gray-200` globally.** Add to the main CSS file:
   ```css
   @layer base {
     *, ::after, ::before, ::backdrop, ::file-selector-button {
       border-color: var(--color-gray-200, currentColor);
     }
   }
   ```

These two `@theme` / `@layer base` overrides go into `frontend/app/assets/css/main.css` (or wherever the codemod lands the new main CSS file) as part of task **B1**.

---

## References

- Nuxt upgrade docs: https://nuxt.com/docs/getting-started/upgrade
- Tailwind v3 → v4 upgrade guide: https://tailwindcss.com/docs/upgrade-guide
- @nuxtjs/tailwindcss v7 PR (merged 2025-05-24): https://github.com/nuxt-modules/tailwindcss/pull/991
- Tailwind official Nuxt install (CSS-first via @tailwindcss/vite): https://tailwindcss.com/docs/installation/framework-guides/nuxt
- Nuxt 4 codemod: `npx codemod@latest nuxt/4/migration-recipe`
- Tailwind 4 codemod: `npx @tailwindcss/upgrade@latest`
