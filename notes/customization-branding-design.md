# Customization / Branding — design

Slice A of the post-auth-hardening round. Operator-configurable branding so a homelab user can re-skin their instance without forking the codebase.

## Goal

Let an operator set the app name, short name, description, theme color, background color, and provide custom logo + login banner images via env vars + drop-in files in the data dir. Backwards-compatible: existing installs with no env or files keep their current SkillGoblin look exactly as today.

## Why

The app currently hardcodes "SkillGoblin" branding in 4+ UI spots and uses a static `frontend/public/site.webmanifest`. Operators forking the project just to change the title is friction we don't need. Pulling these into env + a `data/branding/` drop-in directory unblocks the homelab use case without adding any user-facing complexity.

## Scope (locked)

- New env vars (all optional, all default to current values):
  - `APP_NAME` → `'SkillGoblin'`
  - `APP_SHORT_NAME` → falls back to `APP_NAME` if unset
  - `APP_DESCRIPTION` → `'A streamlined, self-hosted learning platform'`
  - `APP_THEME_COLOR` → `'#111827'` (Tailwind gray-900 — **changed from current `#ffffff`** to match the dark-by-default app; this is the chrome bar color on mobile / PWA install title bar, NOT the in-app dark/light toggle)
  - `APP_BACKGROUND_COLOR` → `'#111827'` (PWA splash screen background; same default for the same reason)
- Hex format validation (`#RRGGBB` or `#RGB`) on the two color env vars at server startup. Invalid value logs a warning and falls back to default.
- New file conventions in the mounted data dir:
  - `data/branding/logo.png` (square logo) — optional. When present, served via `/api/logo` and used in the small-logo spots (courses page header, course detail header). When absent, falls back to the bundled `frontend/public/logos/skillgoblin-logo-square.png`.
  - `data/branding/login-banner.png` (wide banner) — optional. When present, the login screen uses this single image and the existing random rotation from `/api/random-banner` is bypassed. When absent, current rotation behavior preserved exactly.
- New endpoints:
  - `GET /api/logo` — serves the operator logo or the bundled fallback.
  - `GET /api/login-banner` — serves the operator banner if present, otherwise 404. The login page falls back to `/api/random-banner` on 404.
  - `GET /api/webmanifest` — returns dynamic JSON with operator name / short_name / description / theme_color / background_color. Replaces the static `frontend/public/site.webmanifest`.
- Implementation: env values exposed via `runtimeConfig.public.*` at server startup. Consumed by `useHead({ ... })` in `app.vue` for title/meta. The static `site.webmanifest` file gets removed; `<link rel="manifest" href="/api/webmanifest">` points at the new endpoint.
- README documentation: env var table entry + `data/branding/` file conventions (with recommended resolutions: `logo.png` ≥256×256 square, `login-banner.png` recommended ≤1200×500 wide).

## Out of scope

- Favicon family override (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `web-app-manifest-{192,512}.png`). 6 files of various formats; most operators won't care. If they ask later, separate slice.
- Runtime-toggleable branding (admin panel UI). Branding is set once at deploy time; no admin UI for it.
- Per-user branding (e.g. each user picks their own theme). The user-level dark/light toggle stays as-is and is orthogonal to operator branding.
- Banner rotation override that lets operators provide MULTIPLE login-banner images. Either one banner (no rotation) or the bundled set (rotates). YAGNI.

## Server design

### Env reading + validation

A new helper `frontend/server/utils/branding.js` exports:

```js
export function readBranding(env = process.env) {
  const name = (env.APP_NAME || 'SkillGoblin').trim() || 'SkillGoblin';
  const shortName = (env.APP_SHORT_NAME || name).trim() || name;
  const description = (env.APP_DESCRIPTION || 'A streamlined, self-hosted learning platform').trim();

  const themeColor = validHex(env.APP_THEME_COLOR) || '#111827';
  const backgroundColor = validHex(env.APP_BACKGROUND_COLOR) || '#111827';

  return { name, shortName, description, themeColor, backgroundColor };
}

function validHex(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  return null;
}
```

Called once from `nuxt.config.js` to populate `runtimeConfig.public.branding`. Also called at server startup (or imported by the relevant endpoints) so warnings about invalid hex values are emitted once.

A startup warning helper logs invalid colors:

```js
export function warnInvalidColors(env = process.env, log = console.warn) {
  for (const key of ['APP_THEME_COLOR', 'APP_BACKGROUND_COLOR']) {
    const raw = env[key];
    if (raw && !validHex(raw)) log(`[branding] ignoring invalid ${key}=${JSON.stringify(raw)}; using default`);
  }
}
```

Called from `frontend/server/plugins/bootstrap.js` (the existing first-run plugin) so the warning shows up alongside the admin bootstrap log.

### Endpoints

`frontend/server/api/logo.js` (new):

```js
import { existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { defineEventHandler, setResponseHeader } from 'h3';

const DATA_PATH = '/app/data/branding/logo.png';
const FALLBACK_PATH = join(process.cwd(), 'public/logos/skillgoblin-logo-square.png');

export default defineEventHandler((event) => {
  const path = existsSync(DATA_PATH) ? DATA_PATH : FALLBACK_PATH;
  setResponseHeader(event, 'Content-Type', 'image/png');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300'); // short TTL so operator changes show up fast
  return createReadStream(path);
});
```

`frontend/server/api/login-banner.js` (new): similar shape, but no fallback — returns 404 when the file is absent. The login page handles the 404 by falling back to the existing `/api/random-banner` flow.

`frontend/server/api/webmanifest.js` (new):

```js
import { defineEventHandler, setResponseHeader } from 'h3';
import { readBranding } from '../utils/branding.js';

export default defineEventHandler((event) => {
  const b = readBranding();
  setResponseHeader(event, 'Content-Type', 'application/manifest+json');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return {
    name: b.name,
    short_name: b.shortName,
    description: b.description,
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    theme_color: b.themeColor,
    background_color: b.backgroundColor,
    display: 'standalone'
  };
});
```

(Icons stay bundled — see "Out of scope".)

### What does NOT change

- The existing `/api/random-banner` endpoint stays as-is — used by the login page when no operator override exists.
- The bundled `frontend/public/logos/*` files stay (used as fallbacks).
- The bundled favicon family stays (out of scope).
- The session middleware, all authz, the existing system_settings — untouched.

## Frontend design

### `nuxt.config.js`

- Read env once at config load time: `const branding = readBranding();`.
- Use `branding.name`, `branding.description`, `branding.themeColor` directly in the static `app.head` config (title + meta tags). These are read at server process startup, baked into the SPA shell sent to the browser. Title is correct from first paint — no flash.
- Set `runtimeConfig.public.branding = branding` so client-side code (`<h1>` rendering in pages) can read the same values via `useRuntimeConfig().public.branding`.
- Replace `link: [{ rel: 'manifest', href: '/site.webmanifest' }]` with `{ rel: 'manifest', href: '/api/webmanifest' }`.
- Remove the static `frontend/public/site.webmanifest` file entirely.

### `app.vue` or pages

- The existing `<h1>SkillGoblin</h1>` in `pages/index.vue` and `pages/courses/index.vue` gets replaced with `{{ branding.name }}` reading from `useRuntimeConfig().public.branding`.
- `components/course/CourseHeader.vue` text "SkillGoblin" → `{{ branding.name }}`.

### Login page banner logic

`frontend/pages/index.vue`: the existing `randomBanner` ref + `/api/random-banner` fetch becomes a probe-then-fallback. Use `fetch()` with status check (avoids needing HEAD support and matches the existing `fetch()` patterns elsewhere in the codebase):

```js
const probe = await fetch('/api/login-banner', { method: 'HEAD' }).catch(() => null);
if (probe && probe.ok) {
  // Operator override: use it directly, no rotation, no extra request.
  randomBanner.value = '/api/login-banner';
} else {
  // No override — preserve existing rotation behavior exactly.
  $fetch('/api/random-banner').then(({ path }) => {
    const img = new Image();
    img.onload = () => { randomBanner.value = path; };
    img.src = path;
  });
}
```

The HEAD request is just a status probe; if a particular browser doesn't support it, the body fetch on the matching `<img src="/api/login-banner">` would 404 and the existing onerror path could cover it (but that's an extra fallback we can add only if it shows up in testing).

The `<img src="/logos/skillgoblin-logo-wide.png">` placeholder stays as-is — bundled fallback during the brief load period.

### Small-logo replacement

All four `<img src="/logos/skillgoblin-logo-square.png">` references in `pages/courses/index.vue` and `components/course/CourseHeader.vue` change to `<img src="/api/logo">`. The wide logo references in `pages/index.vue` (placeholder) stay bundled — the placeholder is invisible once the banner loads.

## Tests

### Vitest (`frontend/tests/unit/`)

`branding.test.js` (new):
- `readBranding({})` returns the documented defaults.
- `readBranding({ APP_NAME: 'Mine' })` returns name='Mine', shortName='Mine'.
- `readBranding({ APP_NAME: 'Mine', APP_SHORT_NAME: 'M' })` returns name='Mine', shortName='M'.
- `readBranding({ APP_THEME_COLOR: '#abc' })` returns themeColor='#abc' (3-digit hex valid).
- `readBranding({ APP_THEME_COLOR: '#aabbcc' })` returns themeColor='#aabbcc' (6-digit hex valid).
- `readBranding({ APP_THEME_COLOR: 'red' })` returns the default (CSS named colors not accepted).
- `readBranding({ APP_THEME_COLOR: '   ' })` returns the default (whitespace-only).
- `readBranding({ APP_DESCRIPTION: '   ' })` returns the default (whitespace-only treated as unset).
- `warnInvalidColors({ APP_THEME_COLOR: 'red' }, log)` calls log once with a message containing `'red'`.
- `warnInvalidColors({ APP_THEME_COLOR: '#aabbcc' }, log)` does NOT call log (valid value).

### Playwright (`frontend/tests/e2e/`)

`branding.spec.js` (new):
- `GET /api/webmanifest` returns 200 with the documented JSON shape; values match defaults when env unset.
- `GET /api/logo` returns 200 with `Content-Type: image/png`. (Falls back to bundled when no override file exists; that's the test condition since test container has no override.)
- `GET /api/login-banner` returns 404 when no override file exists.
- Login page renders the bundled wide logo (placeholder) and then the random banner from `/api/random-banner` (no override path tested in default container).
- Courses page header `<h1>` text matches the configured `APP_NAME` (defaults to "SkillGoblin").

A second test file or fixture-based variant could mount a `data/branding/` dir with stub files to exercise the override path. We can either: (a) add a separate compose stack for branding-override tests, or (b) skip override-path e2e and rely on unit tests + manual verification. I recommend **(b)** — overrides are cheap to verify manually and adding a compose variant is overhead.

## README + docker-compose.example.yml

- README env vars table: add 5 rows for `APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `APP_THEME_COLOR`, `APP_BACKGROUND_COLOR`.
- README new "Branding" subsection: explains the `data/branding/` directory, the two file names, recommended resolutions (square ≥256×256; banner ≤1200×500 wide; both PNG), and notes that the login banner override disables the bundled rotation.
- `docker-compose.example.yml`: add 5 commented env lines mirroring the new vars.

## Codex review

`notes/customization-branding-codex-prompt.md` before commit. Focus areas:

- Env validation tightness (strict hex regex, no surprising acceptance).
- File-system reads in endpoints (no path traversal, no symlink-following surprise, no surprise `data/branding/` write needed).
- Caching behavior — `Cache-Control: max-age=300` is short enough that operator changes show up within 5 min without a hard reload; long enough that browsers don't hammer the endpoints. Reasonable?
- The dynamic head approach (runtimeConfig.public + nuxt config) — any SSR-disabled gotchas I missed?
- Test gaps.

## Definition of done

- All five env vars wired from `process.env` → `runtimeConfig.public.branding` → consumed by head + page templates.
- `/api/logo`, `/api/login-banner`, `/api/webmanifest` endpoints implemented.
- `frontend/public/site.webmanifest` removed; `<link rel="manifest">` points at `/api/webmanifest`.
- All hardcoded "SkillGoblin" UI strings (login `<h1>`, courses `<h1>`, course-detail header text) read from runtimeConfig.
- All hardcoded `<img src="/logos/skillgoblin-logo-square.png">` references point at `/api/logo`.
- Login page falls back to `/api/random-banner` rotation when no override; uses `/api/login-banner` when present.
- Default theme/bg colors changed to `#111827`.
- Vitest + Playwright suites green in Docker.
- README + docker-compose.example.yml updated.
- Codex review attached.
