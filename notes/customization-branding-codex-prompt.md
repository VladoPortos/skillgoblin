# Codex review — customization / branding

## Context

Branch `feat/customization-branding` adds operator-configurable branding via env vars and drop-in files at `data/branding/`. Five new env vars (`APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `APP_THEME_COLOR`, `APP_BACKGROUND_COLOR`) plumbed through `runtimeConfig.public.branding`. Three new endpoints: `/api/logo`, `/api/login-banner`, `/api/webmanifest`. Static `frontend/public/site.webmanifest` removed; `<link rel="manifest">` now points at the new endpoint. Default `theme_color` and `background_color` changed from `#ffffff` to `#111827` to match the dark-by-default app.

Spec: `notes/customization-branding-design.md`. Plan: `notes/customization-branding-plan.md`.

Commits on this branch (since `origin/main`):
- `c749c67` feat(branding): readBranding helper with hex validation
- `79d09a4` feat(branding): /api/logo, /api/login-banner, /api/webmanifest
- `d62efb87` feat(branding): wire env-driven head + runtimeConfig
- `ffb9ee3` feat(branding): h1 + alt text from runtimeConfig.public.branding
- `74750ee` feat(branding): small logo img src -> /api/logo
- `3f6ae8e` feat(branding): login page probes /api/login-banner before rotating
- `508c912` feat(branding): warn about invalid color env values at startup
- `136829c` docs: APP_* env vars + data/branding/ file conventions

## Review focus (severity gating: BLOCKER / HIGH / MEDIUM / LOW)

Please flag findings with severity. The orchestrator will address BLOCKER + HIGH inline; MEDIUM if cheap; LOW noted in commit body.

1. **Color validation tightness** (`frontend/server/utils/branding.js`). `validHex` accepts only `#RRGGBB` and `#RGB`. Confirm: `#abcdefg`, `red`, `rgb(0,0,0)`, `#`, `#1`, `#12`, `#1234`, `#12345`, `#1234567` all rejected; trimmed valid hex accepted.

2. **File-system reads in endpoints** (`frontend/server/api/logo.js`, `login-banner.js`). Both use `existsSync` + `createReadStream` against hardcoded paths under `/app/data/branding/`. Confirm: no path traversal possible (the path is hardcoded — no user input), no symlink-following surprise that would let an operator inadvertently expose another file (`existsSync` follows symlinks — is that an issue here, given the operator owns the data dir?), no race between `existsSync` and `createReadStream` (TOCTOU).

3. **Caching behavior**. All three endpoints use `Cache-Control: public, max-age=300`. Operators changing files see the update within 5 min without a hard reload. Browsers don't hammer the endpoints. Reasonable middle ground? Or worth shorter (60s) / longer (1h) for one of them? Note: the global `/api/**` routeRule says `Cache-Control: no-cache`, but handler-set headers should override per Nitro precedent (`course-thumbnail/[id].js` does the same with `max-age=31536000` and that's known to work).

4. **`runtimeConfig.public.branding` exposure**. The `branding` object is exposed to the browser via the SPA shell. Any sensitive values? (No — name/description/colors are fine to be public.) Confirm nothing else got included by accident.

5. **Web manifest validity** (`frontend/server/api/webmanifest.js`). Per the W3C PWA manifest spec, the JSON should be valid. Check: required fields present (`name`, `icons` with valid `src`/`sizes`/`type`), optional fields sensible, icon paths actually resolvable from the site root.

6. **Bootstrap warning timing** (`frontend/server/plugins/bootstrap.js`). `warnInvalidColors` runs once at server startup. If an operator changes the env between two restarts (say, fixing a typo), the warning correctly disappears. Anything subtle here?

7. **Test coverage gaps**. Specifically: did we test the override path for `/api/logo` (file present)? The plan defers this to manual verification. Is that acceptable, or should we add a fixture-mounted test variant?

8. **Login-page banner probe robustness** (`frontend/pages/index.vue`). The `fetch('/api/login-banner', { method: 'HEAD' })` — any edge case where this could get stuck (network error, slow server) and leave the banner stuck on the placeholder? The placeholder is `skillgoblin-logo-wide.png` so worst case the user just sees the bundled placeholder until they reload — not a regression — but worth flagging if there's a cleaner pattern.

9. **Vite-resolution deviation** (`frontend/pages/courses/index.vue`, `components/course/CourseHeader.vue`). The plan said `<img src="/api/logo">` (static). The implementer had to switch to `:src="'/api/logo'"` (dynamic binding) because Vite/Rollup tried to resolve the static path as a build-time asset import. Is this the right deviation, or is there a cleaner Vite/Nuxt config that would let static `src` work for `/api/*` URLs?

10. **`msapplication-TileColor` behavior change**. Pre-feature, that meta was `#2d89ef` (Microsoft blue accent); post-feature it's the same as `theme-color` (`#111827` default, or whatever operator sets). This is a small behavior change for the Windows pinned-tile color. Acceptable simplification, or should there be a separate `APP_TILE_COLOR` knob?

11. **Anything else** — security, race conditions, error-handling gaps, naming inconsistencies, dead code, performance landmines.

## Out of scope

Anything not in this PR. Do not propose unrelated refactors. Do not propose UI redesigns. Do not propose making favicon family configurable (separate slice). Do not propose runtime-toggleable branding via admin panel (intentionally env-only per the spec).

## Format

Per finding: severity, title, file:line, description, suggested fix.
