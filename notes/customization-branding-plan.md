# Customization / Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make app name, short name, description, theme/background colors, and small + login-banner logos operator-configurable via env vars + drop-in files in `data/branding/`. Backwards-compatible: unset env / missing files preserve current SkillGoblin behavior exactly.

**Architecture:** A `readBranding()` helper reads env at server startup, returns defaults for unset values, validates colors as `#RRGGBB`/`#RGB` hex (invalid → default + startup warning). Values exposed via `runtimeConfig.public.branding` for client templates and used directly in `nuxt.config.js` `app.head` for title/meta. Three new endpoints: `/api/logo` (square logo with bundled fallback), `/api/login-banner` (wide banner; 404 when no override), `/api/webmanifest` (dynamic JSON, replaces static `frontend/public/site.webmanifest`). Login page probes the banner endpoint and falls back to the existing `/api/random-banner` rotation when no override exists.

**Tech Stack:** Nuxt 3 (SSR off), Nitro server endpoints, Vue 3 composition API, Vitest, Playwright in Docker.

**Spec reference:** [notes/customization-branding-design.md](notes/customization-branding-design.md)

**Hard rules from [notes/handover.md](notes/handover.md):**
- No Claude attribution in commit messages.
- All tests run in Docker only:
  ```
  docker compose -f docker-compose.test.yml down -v
  docker compose -f docker-compose.test.yml run --rm --build tests
  ```
- One commit per logical step. Each commit must leave the suite green.

---

## File map

### New files
- `frontend/server/utils/branding.js` — `readBranding(env)` + `validHex(v)` + `warnInvalidColors(env, log)` helpers.
- `frontend/server/api/logo.js` — serves `/app/data/branding/logo.png` if present, else bundled `frontend/public/logos/skillgoblin-logo-square.png`. PNG with 5-min cache.
- `frontend/server/api/login-banner.js` — serves `/app/data/branding/login-banner.png` if present, else 404. PNG with 5-min cache.
- `frontend/server/api/webmanifest.js` — dynamic JSON manifest reading `readBranding()`. Icons stay bundled.
- `frontend/tests/unit/branding.test.js` — vitest for helper.
- `frontend/tests/e2e/branding.spec.js` — Playwright covering the three endpoints + that the login `<h1>` text matches `APP_NAME`.

### Modified files
- `frontend/nuxt.config.js` — read env via `readBranding()` at config time, populate `app.head` (title/description/theme-color/msapplication-TileColor) and `runtimeConfig.public.branding`. Swap the manifest link to `/api/webmanifest`.
- `frontend/pages/index.vue` — `<h1>` text from `runtimeConfig.public.branding.name`; banner probe-and-fallback for `/api/login-banner` → `/api/random-banner`.
- `frontend/pages/courses/index.vue` — `<h1>` text from `runtimeConfig.public.branding.name`; small logo `<img src>` → `/api/logo`.
- `frontend/components/course/CourseHeader.vue` — header text from `runtimeConfig.public.branding.name`; small logo `<img src>` → `/api/logo`.
- `frontend/server/plugins/bootstrap.js` — call `warnInvalidColors(process.env)` so invalid hex env values log a startup warning.
- `README.md` — env vars table entries + new "Branding / customization" subsection documenting `data/branding/` file conventions and recommended resolutions.
- `docker-compose.example.yml` — five commented example env lines.

### Deleted files
- `frontend/public/site.webmanifest` — replaced by `/api/webmanifest`.

---

## Task 1: Branding helper + unit tests

**Files:**
- Create: `frontend/server/utils/branding.js`
- Test: `frontend/tests/unit/branding.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/unit/branding.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { readBranding, validHex, warnInvalidColors } from '../../server/utils/branding.js';

describe('readBranding — defaults', () => {
  it('returns documented defaults when env is empty', () => {
    const b = readBranding({});
    expect(b.name).toBe('SkillGoblin');
    expect(b.shortName).toBe('SkillGoblin');
    expect(b.description).toBe('A streamlined, self-hosted learning platform');
    expect(b.themeColor).toBe('#111827');
    expect(b.backgroundColor).toBe('#111827');
  });

  it('treats whitespace-only env values as unset', () => {
    const b = readBranding({
      APP_NAME: '   ',
      APP_DESCRIPTION: '\t',
      APP_SHORT_NAME: ' '
    });
    expect(b.name).toBe('SkillGoblin');
    expect(b.shortName).toBe('SkillGoblin');
    expect(b.description).toBe('A streamlined, self-hosted learning platform');
  });
});

describe('readBranding — overrides', () => {
  it('uses APP_NAME and falls back shortName to name when shortName unset', () => {
    const b = readBranding({ APP_NAME: 'Mine' });
    expect(b.name).toBe('Mine');
    expect(b.shortName).toBe('Mine');
  });

  it('uses APP_SHORT_NAME independently when set', () => {
    const b = readBranding({ APP_NAME: 'Mine', APP_SHORT_NAME: 'M' });
    expect(b.name).toBe('Mine');
    expect(b.shortName).toBe('M');
  });

  it('uses APP_DESCRIPTION when set', () => {
    const b = readBranding({ APP_DESCRIPTION: 'Custom desc' });
    expect(b.description).toBe('Custom desc');
  });

  it('trims surrounding whitespace from values', () => {
    const b = readBranding({ APP_NAME: '  Padded  ' });
    expect(b.name).toBe('Padded');
  });
});

describe('readBranding — color validation', () => {
  it('accepts 6-digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#aabbcc' }).themeColor).toBe('#aabbcc');
  });

  it('accepts 3-digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#abc' }).themeColor).toBe('#abc');
  });

  it('rejects CSS named colors and falls back to default', () => {
    expect(readBranding({ APP_THEME_COLOR: 'red' }).themeColor).toBe('#111827');
  });

  it('rejects rgb() and falls back to default', () => {
    expect(readBranding({ APP_THEME_COLOR: 'rgb(255,0,0)' }).themeColor).toBe('#111827');
  });

  it('rejects bare hex without #', () => {
    expect(readBranding({ APP_THEME_COLOR: 'aabbcc' }).themeColor).toBe('#111827');
  });

  it('rejects 4 or 5 digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#abcd' }).themeColor).toBe('#111827');
    expect(readBranding({ APP_THEME_COLOR: '#abcde' }).themeColor).toBe('#111827');
  });

  it('applies the same validation to APP_BACKGROUND_COLOR', () => {
    expect(readBranding({ APP_BACKGROUND_COLOR: '#fff' }).backgroundColor).toBe('#fff');
    expect(readBranding({ APP_BACKGROUND_COLOR: 'wat' }).backgroundColor).toBe('#111827');
  });
});

describe('validHex', () => {
  it('returns the trimmed value for valid hex', () => {
    expect(validHex('  #abc  ')).toBe('#abc');
    expect(validHex('#aabbcc')).toBe('#aabbcc');
  });
  it('returns null for invalid', () => {
    expect(validHex('red')).toBe(null);
    expect(validHex('')).toBe(null);
    expect(validHex(undefined)).toBe(null);
    expect(validHex(null)).toBe(null);
    expect(validHex(123)).toBe(null);
  });
});

describe('warnInvalidColors', () => {
  it('warns once for each invalid color env value', () => {
    const log = vi.fn();
    warnInvalidColors({ APP_THEME_COLOR: 'red', APP_BACKGROUND_COLOR: 'blue' }, log);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatch(/APP_THEME_COLOR/);
    expect(log.mock.calls[0][0]).toMatch(/red/);
    expect(log.mock.calls[1][0]).toMatch(/APP_BACKGROUND_COLOR/);
  });

  it('does not warn for valid colors', () => {
    const log = vi.fn();
    warnInvalidColors({ APP_THEME_COLOR: '#abc', APP_BACKGROUND_COLOR: '#aabbcc' }, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not warn for unset env values', () => {
    const log = vi.fn();
    warnInvalidColors({}, log);
    expect(log).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: `branding.test.js` fails — module not found.

- [ ] **Step 3: Create the branding helper**

Create `frontend/server/utils/branding.js`:

```js
// Operator branding values read from env at server startup. Defaults are
// chosen to preserve the current SkillGoblin look exactly when no env is
// set, so existing installs upgrade with no behavior change.
//
// Color validation is strict #RRGGBB or #RGB hex. Anything else (CSS
// named colors, rgb(), typos) falls back to the default and a one-line
// warning is logged at startup via warnInvalidColors().

const DEFAULT_NAME = 'SkillGoblin';
const DEFAULT_DESCRIPTION = 'A streamlined, self-hosted learning platform';
const DEFAULT_COLOR = '#111827'; // Tailwind gray-900 — matches the dark-by-default app

export function readBranding(env = process.env) {
  const name = trimToString(env.APP_NAME) || DEFAULT_NAME;
  const shortName = trimToString(env.APP_SHORT_NAME) || name;
  const description = trimToString(env.APP_DESCRIPTION) || DEFAULT_DESCRIPTION;
  const themeColor = validHex(env.APP_THEME_COLOR) || DEFAULT_COLOR;
  const backgroundColor = validHex(env.APP_BACKGROUND_COLOR) || DEFAULT_COLOR;
  return { name, shortName, description, themeColor, backgroundColor };
}

export function validHex(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  return null;
}

export function warnInvalidColors(env = process.env, log = console.warn) {
  for (const key of ['APP_THEME_COLOR', 'APP_BACKGROUND_COLOR']) {
    const raw = env[key];
    if (typeof raw === 'string' && raw.trim() !== '' && !validHex(raw)) {
      log(`[branding] ignoring invalid ${key}=${JSON.stringify(raw)}; using default ${DEFAULT_COLOR}`);
    }
  }
}

function trimToString(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: all `branding.test.js` tests pass; existing unit tests still green.

- [ ] **Step 5: Commit**

```
git add frontend/server/utils/branding.js frontend/tests/unit/branding.test.js
git commit -m "feat(branding): readBranding helper with hex validation

Pure utility that reads APP_NAME / APP_SHORT_NAME / APP_DESCRIPTION /
APP_THEME_COLOR / APP_BACKGROUND_COLOR from env, returning current
SkillGoblin defaults when unset. Strict #RRGGBB / #RGB hex validation
on the two color env vars; invalid values fall back to default and a
warning helper logs once per invalid value at startup."
```

---

## Task 2: Three new API endpoints + e2e tests

**Files:**
- Create: `frontend/server/api/logo.js`
- Create: `frontend/server/api/login-banner.js`
- Create: `frontend/server/api/webmanifest.js`
- Test: `frontend/tests/e2e/branding.spec.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/tests/e2e/branding.spec.js`:

```js
import { test, expect, request as pwRequest } from '@playwright/test';

async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://web:3000' });
}

test.describe('GET /api/webmanifest', () => {
  test('returns a JSON manifest with the documented shape', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/webmanifest');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toMatch(/application\/manifest\+json|application\/json/);
    const body = await r.json();
    expect(body).toMatchObject({
      name: 'SkillGoblin',
      short_name: 'SkillGoblin',
      description: 'A streamlined, self-hosted learning platform',
      theme_color: '#111827',
      background_color: '#111827',
      display: 'standalone'
    });
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThanOrEqual(1);
    await ctx.dispose();
  });
});

test.describe('GET /api/logo', () => {
  test('falls back to the bundled square logo when no override file exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/logo');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await ctx.dispose();
  });
});

test.describe('GET /api/login-banner', () => {
  test('returns 404 when no override file exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/login-banner');
    expect(r.status()).toBe(404);
    await ctx.dispose();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: all three new tests fail — endpoints return 404 (Nitro auto-discovery hasn't found them yet).

- [ ] **Step 3: Create the logo endpoint**

Create `frontend/server/api/logo.js`:

```js
import { existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { defineEventHandler, setResponseHeader } from 'h3';

// Operator-overridable square logo. Drop a PNG at the documented data
// path to override; otherwise the bundled SkillGoblin square logo serves.
//
// Cache: 5 minutes — short enough that operator changes show up fast,
// long enough that browsers don't re-fetch on every page nav.
const DATA_PATH = '/app/data/branding/logo.png';
const FALLBACK_PATH = join(process.cwd(), 'public/logos/skillgoblin-logo-square.png');

export default defineEventHandler((event) => {
  const path = existsSync(DATA_PATH) ? DATA_PATH : FALLBACK_PATH;
  setResponseHeader(event, 'Content-Type', 'image/png');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return createReadStream(path);
});
```

- [ ] **Step 4: Create the login-banner endpoint**

Create `frontend/server/api/login-banner.js`:

```js
import { existsSync, createReadStream } from 'node:fs';
import { defineEventHandler, setResponseHeader, createError } from 'h3';

// Operator-overridable login-screen banner. Wide-aspect PNG dropped at
// the documented data path. When absent, the endpoint returns 404 and
// the login page falls back to the existing /api/random-banner rotation.
const DATA_PATH = '/app/data/branding/login-banner.png';

export default defineEventHandler((event) => {
  if (!existsSync(DATA_PATH)) {
    throw createError({ statusCode: 404, statusMessage: 'No operator login banner configured' });
  }
  setResponseHeader(event, 'Content-Type', 'image/png');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return createReadStream(DATA_PATH);
});
```

- [ ] **Step 5: Create the webmanifest endpoint**

Create `frontend/server/api/webmanifest.js`:

```js
import { defineEventHandler, setResponseHeader } from 'h3';
import { readBranding } from '../utils/branding.js';

// Dynamic PWA manifest. Replaces the static frontend/public/site.webmanifest
// so operator branding (name, theme color, etc.) flows through to the
// install prompt and home-screen icon label without a rebuild.
//
// Icons stay bundled — see notes/customization-branding-design.md "Out
// of scope" for why.
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

- [ ] **Step 6: Run the tests to verify they pass**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: all three new e2e tests pass; full suite green.

- [ ] **Step 7: Commit**

```
git add frontend/server/api/logo.js frontend/server/api/login-banner.js \
        frontend/server/api/webmanifest.js \
        frontend/tests/e2e/branding.spec.js
git commit -m "feat(branding): /api/logo, /api/login-banner, /api/webmanifest

Three Nitro endpoints powering operator branding:

  - /api/logo serves data/branding/logo.png if present, else falls back
    to the bundled square SkillGoblin logo.
  - /api/login-banner serves data/branding/login-banner.png if present,
    else 404 (login page handles the fallback to /api/random-banner).
  - /api/webmanifest returns a dynamic PWA manifest reading readBranding().

All three short-cache (5 min) so operator changes show up fast without
hammering the endpoints on every page nav."
```

---

## Task 3: nuxt.config.js wiring + remove static manifest

**Files:**
- Modify: `frontend/nuxt.config.js`
- Delete: `frontend/public/site.webmanifest`

- [ ] **Step 1: Read the current `nuxt.config.js` head + runtimeConfig**

```
cat frontend/nuxt.config.js
```

Confirm the current `app.head.title`, `meta description`, `meta theme-color`, and the `link` array containing `{ rel: 'manifest', href: '/site.webmanifest' }`.

- [ ] **Step 2: Update `nuxt.config.js`**

Replace the entire file content with:

```js
// https://nuxt.com/docs/api/configuration/nuxt-config
import { readBranding } from './server/utils/branding.js';

const branding = readBranding();

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss'
  ],
  // Disable SSR to prevent hydration mismatches with complex components
  ssr: false,
  nitro: {
    // Configure for better handling of large static files and caching
    routeRules: {
      // Content caching - allow byte ranges for videos but keep cache control
      '/content/**': {
        static: true,
        headers: {
          'Accept-Ranges': 'bytes',
        }
      },
      // API endpoints - prevent caching to ensure fresh data
      '/api/**': {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      },
      // Main HTML pages - prevent caching to always show latest content
      '/**': {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    }
  },
  app: {
    head: {
      title: branding.name,
      meta: [
        { name: 'description', content: branding.description },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'msapplication-TileColor', content: branding.themeColor },
        { name: 'theme-color', content: branding.themeColor },
        // Add meta tags to control browser caching
        { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' },
        { 'http-equiv': 'Pragma', content: 'no-cache' },
        { 'http-equiv': 'Expires', content: '0' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/api/webmanifest' }
      ]
    }
  },
  runtimeConfig: {
    // The private keys which are only available server-side
    databasePath: process.env.DATABASE_PATH || '/app/data/database/database.sqlite',
    // Public keys that are exposed to the client
    public: {
      apiBase: '/api',
      branding
    }
  }
})
```

Three changes from current:
1. New `import { readBranding } from './server/utils/branding.js';` at the top + `const branding = readBranding();`.
2. `title`, `meta description`, `meta msapplication-TileColor`, `meta theme-color` all read from `branding.*`.
3. `link` manifest href changed from `/site.webmanifest` to `/api/webmanifest`.
4. `runtimeConfig.public` gains `branding`.

- [ ] **Step 3: Delete the static manifest**

```
git rm frontend/public/site.webmanifest
```

- [ ] **Step 4: Run the test suite to verify nothing regressed**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full suite still green. The /api/webmanifest test from Task 2 still passes (it was checking the endpoint, not the link tag); all other e2e tests unchanged.

(There's no specific test for the title or the link tag here. Manual smoke covers them later.)

- [ ] **Step 5: Commit**

```
git add frontend/nuxt.config.js
git commit -m "feat(branding): wire env-driven head + runtimeConfig

nuxt.config.js reads readBranding() at server startup and uses the
returned values for title, description, theme-color, and msapplication-
TileColor in app.head. Same values exposed via runtimeConfig.public.branding
for client-side <h1> consumption in the next task. Static
frontend/public/site.webmanifest deleted; the manifest link now points
at /api/webmanifest."
```

---

## Task 4: Replace hardcoded UI strings with `runtimeConfig.public.branding.name`

**Files:**
- Modify: `frontend/pages/index.vue`
- Modify: `frontend/pages/courses/index.vue`
- Modify: `frontend/components/course/CourseHeader.vue`
- Test: `frontend/tests/e2e/branding.spec.js` (extend)

- [ ] **Step 1: Add a failing e2e test asserting the h1 reflects branding**

Append to `frontend/tests/e2e/branding.spec.js`:

```js
test.describe('Login screen — h1 reflects APP_NAME', () => {
  test('default APP_NAME shows "SkillGoblin" as the h1', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('SkillGoblin');
  });
});
```

- [ ] **Step 2: Run the test to verify it passes against the hardcoded current state**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the new test PASSES (because the current hardcoded `<h1>SkillGoblin</h1>` matches the default). This test is a regression-guard for the next step — it must continue to pass after we change the source from a literal to a binding.

- [ ] **Step 3: Update `frontend/pages/index.vue`**

Find line 23:

```vue
        <h1 class="text-3xl font-bold text-white">SkillGoblin</h1>
```

Replace with:

```vue
        <h1 class="text-3xl font-bold text-white">{{ branding.name }}</h1>
```

In the `<script setup>` block, add this line near the top (after the existing imports/uses):

```js
const branding = useRuntimeConfig().public.branding;
```

Search the existing script for `useRuntimeConfig` to confirm whether it's already destructured elsewhere — if so, just add `branding` to the existing destructure. (There are no current `useRuntimeConfig` calls in this file based on the codebase audit, so add the new line.)

Also update the placeholder banner image's alt text on lines 10 and 17 from `alt="SkillGoblin"` to `:alt="branding.name"` (so screen readers announce the operator's brand, not the literal "SkillGoblin").

- [ ] **Step 4: Update `frontend/pages/courses/index.vue`**

Find line 7:

```vue
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">SkillGoblin</h1>
```

Replace with:

```vue
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ branding.name }}</h1>
```

Also update the alt text on line 6: `alt="SkillGoblin Logo"` → `:alt="`${branding.name} Logo`"` (note the backticks for template literal).

In the `<script setup>` block, add:

```js
const branding = useRuntimeConfig().public.branding;
```

(Same caveat — search for any existing `useRuntimeConfig` in the file first.)

- [ ] **Step 5: Update `frontend/components/course/CourseHeader.vue`**

Find lines 11-12:

```vue
          <img src="/logos/skillgoblin-logo-square.png" alt="SkillGoblin Logo" class="w-6 h-6 mr-2 hidden sm:block" />
          <span class="text-sm font-medium text-gray-900 dark:text-white hidden sm:block">SkillGoblin</span>
```

Replace with:

```vue
          <img src="/logos/skillgoblin-logo-square.png" :alt="`${branding.name} Logo`" class="w-6 h-6 mr-2 hidden sm:block" />
          <span class="text-sm font-medium text-gray-900 dark:text-white hidden sm:block">{{ branding.name }}</span>
```

(Note: this task only changes the TEXT — the `<img src>` to `/api/logo` change happens in Task 5 to keep the diff focused.)

In the `<script setup>` block, add:

```js
const branding = useRuntimeConfig().public.branding;
```

- [ ] **Step 6: Run the test to verify it still passes**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: the regression-guard test from Step 1 still PASSES (now via the binding rather than the literal).

- [ ] **Step 7: Commit**

```
git add frontend/pages/index.vue frontend/pages/courses/index.vue \
        frontend/components/course/CourseHeader.vue \
        frontend/tests/e2e/branding.spec.js
git commit -m "feat(branding): h1 + alt text from runtimeConfig.public.branding

Replaces hardcoded 'SkillGoblin' literals in three UI surfaces with
bindings to runtimeConfig.public.branding.name. The default value of
'SkillGoblin' is preserved when no APP_NAME env is set, so the visible
behavior is unchanged for existing installs.

A regression-guard e2e test asserts the login h1 still reads 'SkillGoblin'
under the default config, locking in that the binding behaves identically
to the previous literal."
```

---

## Task 5: Replace hardcoded small-logo `<img src>` with `/api/logo`

**Files:**
- Modify: `frontend/pages/courses/index.vue`
- Modify: `frontend/components/course/CourseHeader.vue`

- [ ] **Step 1: Update `frontend/pages/courses/index.vue`**

Find line 6:

```vue
          <img src="/logos/skillgoblin-logo-square.png" :alt="`${branding.name} Logo`" class="w-10 h-10 mr-3" />
```

(That alt was set in Task 4 — it's already correct.)

Replace with:

```vue
          <img src="/api/logo" :alt="`${branding.name} Logo`" class="w-10 h-10 mr-3" />
```

- [ ] **Step 2: Update `frontend/components/course/CourseHeader.vue`**

Find line 11:

```vue
          <img src="/logos/skillgoblin-logo-square.png" :alt="`${branding.name} Logo`" class="w-6 h-6 mr-2 hidden sm:block" />
```

Replace with:

```vue
          <img src="/api/logo" :alt="`${branding.name} Logo`" class="w-6 h-6 mr-2 hidden sm:block" />
```

- [ ] **Step 3: Run the test suite to verify no regressions**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full suite green. The `/api/logo` endpoint exists (Task 2), serves the bundled fallback in this test environment (no override file mounted), and the browser fetches it as a normal `<img>` request.

- [ ] **Step 4: Commit**

```
git add frontend/pages/courses/index.vue frontend/components/course/CourseHeader.vue
git commit -m "feat(branding): small logo img src -> /api/logo

Both small-logo spots (courses page header, course detail header) now
point at the new /api/logo endpoint, which serves data/branding/logo.png
when present and falls back to the bundled square SkillGoblin logo
otherwise. Visible behavior unchanged for existing installs (fallback
serves the same bundled file the templates referenced before)."
```

---

## Task 6: Login page banner probe-and-fallback

**Files:**
- Modify: `frontend/pages/index.vue`

- [ ] **Step 1: Locate the existing banner-fetch code**

Read `frontend/pages/index.vue` lines 540-560 (the `onMounted` hook that calls `/api/random-banner`).

Current code:

```js
  $fetch('/api/random-banner')
    .then(({ path }) => {
      if (path) {
        const img = new Image();
        img.onload = () => randomBanner.value = path;
        img.src = path;
      }
    })
    .catch(console.error);
```

- [ ] **Step 2: Replace it with a probe-then-fallback**

Replace the block above with:

```js
  // Operator override probe: if /api/login-banner returns 200 the operator
  // dropped a custom banner — use it directly, no rotation. Otherwise
  // fall back to the existing random rotation from /api/random-banner so
  // existing installs keep their current behavior exactly.
  fetch('/api/login-banner', { method: 'HEAD' })
    .then((probe) => {
      if (probe.ok) {
        randomBanner.value = '/api/login-banner';
        return;
      }
      return $fetch('/api/random-banner').then(({ path }) => {
        if (path) {
          const img = new Image();
          img.onload = () => randomBanner.value = path;
          img.src = path;
        }
      });
    })
    .catch(console.error);
```

(`fetch` here is the browser's native `fetch`, distinct from Nuxt's `$fetch`. We use the native one for the probe because we want the raw status, not a thrown error on 404.)

- [ ] **Step 3: Run the test suite to verify no regressions**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full suite green. In the test container the `/api/login-banner` endpoint returns 404 (no override file), so the fallback branch runs and the existing rotation behavior is preserved end-to-end.

- [ ] **Step 4: Commit**

```
git add frontend/pages/index.vue
git commit -m "feat(branding): login page probes /api/login-banner before rotating

If the operator dropped data/branding/login-banner.png (the new
/api/login-banner endpoint returns 200), the login page uses that
single image and skips the rotation entirely. Otherwise — the
existing-install case — the original /api/random-banner rotation runs
exactly as before. Probe uses native fetch HEAD so a 404 doesn't throw
and the fallback runs cleanly."
```

---

## Task 7: Bootstrap warning for invalid color env values

**Files:**
- Modify: `frontend/server/plugins/bootstrap.js`
- Test: `frontend/tests/unit/branding.test.js` already covers `warnInvalidColors` (Task 1)

- [ ] **Step 1: Read the existing bootstrap plugin**

```
cat frontend/server/plugins/bootstrap.js
```

It currently calls `bootstrapAdmin(db, process.env)` and `reportLegacyCredentialGaps(db)`.

- [ ] **Step 2: Add the color-warning call**

Edit `frontend/server/plugins/bootstrap.js`:

```js
import { getDb } from '../utils/db';
import { bootstrapAdmin, reportLegacyCredentialGaps } from '../utils/bootstrap';
import { warnInvalidColors } from '../utils/branding';

// Nitro server plugin — runs once at startup before any request handler
// can serve traffic. Throwing here aborts the server boot, which is exactly
// what we want when ADMIN_NAME / ADMIN_PASSWORD are missing on a fresh
// install.
export default defineNitroPlugin(async (_nitroApp) => {
  const db = getDb();
  await bootstrapAdmin(db, process.env);
  reportLegacyCredentialGaps(db);
  warnInvalidColors(process.env);
});
```

- [ ] **Step 3: Run the test suite**

```
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full suite green. The unit tests for `warnInvalidColors` from Task 1 cover the function's behavior; this step just wires it into the boot sequence.

- [ ] **Step 4: Commit**

```
git add frontend/server/plugins/bootstrap.js
git commit -m "feat(branding): warn about invalid color env values at startup

The bootstrap plugin already runs bootstrapAdmin + reportLegacyCredentialGaps;
adds warnInvalidColors so an operator who typo'd APP_THEME_COLOR=red
sees a one-line warning at boot rather than silently getting the default."
```

---

## Task 8: Documentation — README + docker-compose.example.yml

**Files:**
- Modify: `README.md`
- Modify: `docker-compose.example.yml`

- [ ] **Step 1: Read both files first**

```
cat README.md | head -200
cat docker-compose.example.yml
```

Find the env-vars table in the README (search for `ADMIN_NAME` or `ALLOW_USER_REGISTRATION`).

- [ ] **Step 2: Add 5 env-var rows to the README**

Add these rows to the env vars table, immediately after the existing `ALLOW_USER_REGISTRATION` row (or wherever the customization-related vars naturally cluster):

```
| `APP_NAME` | `SkillGoblin` | Display name shown in the browser tab title, the login screen `<h1>`, the courses page header, and the PWA install label. |
| `APP_SHORT_NAME` | (`APP_NAME`) | Short display name used by the PWA install icon. Defaults to `APP_NAME` when unset. |
| `APP_DESCRIPTION` | `A streamlined, self-hosted learning platform` | Meta description tag and PWA manifest `description`. |
| `APP_THEME_COLOR` | `#111827` | Mobile browser chrome bar color and PWA manifest `theme_color`. Hex `#RRGGBB` or `#RGB`; invalid values fall back to default and log a startup warning. NOTE: This is the browser-chrome color, not the in-app dark/light theme. |
| `APP_BACKGROUND_COLOR` | `#111827` | PWA splash screen background. Same hex format as `APP_THEME_COLOR`. |
```

(If the table format in the README differs, adapt to its column shape — the values above are what should appear regardless.)

- [ ] **Step 3: Add a new "Branding / customization" subsection to the README**

After the env vars table (or in a sensible place near it), add:

```markdown
### Branding / custom logos

To replace the bundled SkillGoblin logos with your own, drop PNG files into a `branding/` subdirectory inside your mounted data volume:

| File | Used for | Recommended size |
|---|---|---|
| `data/branding/logo.png` | Small square logo on the courses page header and course detail header | ≥ 256 × 256 px, square aspect |
| `data/branding/login-banner.png` | Wide banner on the login screen above the user picker | ≤ 1200 × 500 px, wide aspect (landscape) |

Both files are optional. Missing `logo.png` falls back to the bundled square SkillGoblin logo. Missing `login-banner.png` falls back to the bundled rotating banner set (one of the random images in `frontend/public/banners/`).

Providing `login-banner.png` **disables the random banner rotation** — operators who want their own single brand image on the login screen rather than the rotating built-in set should drop one in.

Files are served via `/api/logo` and `/api/login-banner` with a 5-minute cache. Drop a new file and the change shows up within ~5 minutes (or immediately on a hard reload).

Favicon family (`favicon.ico`, apple touch icon, PWA manifest icons) is currently bundled and not operator-configurable.
```

- [ ] **Step 4: Add 5 commented env entries to docker-compose.example.yml**

Find the `environment:` block and add these commented lines below the `ALLOW_USER_REGISTRATION` example (or the registration-related cluster):

```yaml
      # Operator branding — all optional; defaults preserve the bundled SkillGoblin look.
      # - APP_NAME=My Learning Hub
      # - APP_SHORT_NAME=Hub
      # - APP_DESCRIPTION=Internal team training platform
      # - APP_THEME_COLOR=#1f2937
      # - APP_BACKGROUND_COLOR=#111827
```

Match the indentation of the existing commented entries (6 spaces for `# - VAR=value`).

- [ ] **Step 5: Sanity check**

```
docker compose -f docker-compose.example.yml config --quiet
```

Should exit cleanly (YAML still valid).

- [ ] **Step 6: Commit**

```
git add README.md docker-compose.example.yml
git commit -m "docs: APP_* env vars + data/branding/ file conventions

Five env-var rows added to the README env table covering APP_NAME /
APP_SHORT_NAME / APP_DESCRIPTION / APP_THEME_COLOR / APP_BACKGROUND_COLOR.
New 'Branding / custom logos' subsection documents the data/branding/
drop-in directory with recommended resolutions for logo.png and
login-banner.png. docker-compose.example.yml gets matching commented
entries so operators see the option exists."
```

---

## Task 9: Codex review pass

**Files:**
- Create: `notes/customization-branding-codex-prompt.md`

- [ ] **Step 1: Draft the Codex review prompt**

Create `notes/customization-branding-codex-prompt.md`:

```markdown
# Codex review — customization / branding

## Context

Branch `feat/customization-branding` adds operator-configurable branding via env vars and drop-in files at `data/branding/`. Five new env vars (`APP_NAME`, `APP_SHORT_NAME`, `APP_DESCRIPTION`, `APP_THEME_COLOR`, `APP_BACKGROUND_COLOR`) plumbed through `runtimeConfig.public.branding`. Three new endpoints: `/api/logo`, `/api/login-banner`, `/api/webmanifest`. Static `frontend/public/site.webmanifest` removed; `<link rel="manifest">` now points at the new endpoint. Default `theme_color` and `background_color` changed from `#ffffff` to `#111827` to match the dark-by-default app.

Spec: `notes/customization-branding-design.md`. Plan: `notes/customization-branding-plan.md`.

## Review focus (severity gating: BLOCKER / HIGH / MEDIUM / LOW)

1. **Color validation tightness.** `validHex` accepts only `#RRGGBB` and `#RGB`. Confirm: `#abcdefg`, `red`, `rgb(0,0,0)`, `#`, `#1`, `#12`, `#1234`, `#12345`, `#1234567` all rejected; trimmed valid hex accepted.

2. **File-system reads in endpoints.** `/api/logo` and `/api/login-banner` use `existsSync` + `createReadStream` against `/app/data/branding/logo.png` and `.../login-banner.png`. Confirm: no path traversal possible (the path is hardcoded, no user input), no symlink-following surprise that would let an operator inadvertently expose another file (`existsSync` follows symlinks — is that an issue here?), no race between `existsSync` and `createReadStream` (TOCTOU).

3. **Caching behavior.** All three endpoints use `Cache-Control: public, max-age=300`. Operators changing files see the update within 5 min without a hard reload. Browsers don't hammer the endpoints. Reasonable middle ground? Or worth shorter (60s) / longer (1h) for one of them?

4. **`runtimeConfig.public.branding` exposure.** The `branding` object is exposed to the browser via the SPA shell. Any sensitive values? (No — name/description/colors are fine to be public.) Confirm nothing else got included by accident.

5. **Web manifest validity.** Per the W3C PWA manifest spec, the JSON we return should be valid. Check: required fields present (`name`, `icons` with valid `src`/`sizes`/`type`), optional fields sensible, icon paths actually resolvable from the site root.

6. **The bootstrap warning timing.** `warnInvalidColors` runs once in the bootstrap plugin. If an operator changes the env between two restarts (say, fixing a typo), the warning correctly disappears. Anything subtle here?

7. **Test coverage gaps.** Specifically: did we test the override path for `/api/logo` (file present)? The plan defers this to manual verification. Is that acceptable, or should we add a fixture-mounted test variant?

8. **Login-page banner probe robustness.** The `fetch('/api/login-banner', { method: 'HEAD' })` in `frontend/pages/index.vue` — any edge case where this could get stuck (network error, slow server) and leave the banner stuck on the placeholder? The placeholder is `skillgoblin-logo-wide.png` so worst case the user just sees the bundled placeholder until they reload — not a regression — but worth flagging if there's a cleaner pattern.

9. **Anything else** — security, race conditions, error-handling gaps, naming inconsistencies, dead code, performance landmines.

## Out of scope

Anything not in this PR. Do not propose unrelated refactors. Do not propose UI redesigns. Do not propose making favicon family configurable (separate slice).

## Format

Per finding: severity, title, file:line, description, suggested fix.
```

- [ ] **Step 2: Run Codex via the project's Bash invocation**

```
node "C:/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs" task < notes/customization-branding-codex-prompt.md
```

Capture the full stdout. Codex may take 1–5 minutes.

- [ ] **Step 3: Address findings**

For each BLOCKER / HIGH / reasonable MEDIUM:
- Apply the fix.
- Re-run the suite via Docker.
- Commit per fix (`fix(<scope>): <what>`).

Document any LOW deferrals in the PR description.

- [ ] **Step 4: Commit the prompt**

```
git add notes/customization-branding-codex-prompt.md
git commit -m "docs: codex review prompt for customization-branding

Captures the focus areas, severity gating, and out-of-scope notes for
the second-pair-of-eyes pass before opening the PR."
```

---

## Task 10: Final verification + PR

- [ ] **Step 1: Full clean-DB test pass**

```
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full vitest + Playwright suites green. Note totals (vitest gains the branding helper tests; Playwright gains the branding endpoint + h1 tests).

- [ ] **Step 2: Manual smoke prep**

Bring up `docker-compose.manual.yml` against the new branch. Default state: no override files in `manual-test/data/branding/`, no APP_* env vars set in the compose file. Verify in the browser:

- Login screen `<h1>` reads "SkillGoblin"; banner rotates on reload (random from bundled set).
- Browser tab title is "SkillGoblin".
- View source on the page → `<link rel="manifest" href="/api/webmanifest">`.
- Hit `http://localhost:3001/api/webmanifest` directly → JSON with default values.
- Hit `http://localhost:3001/api/logo` directly → bundled square logo PNG.
- Hit `http://localhost:3001/api/login-banner` directly → 404.
- Drop a `manual-test/data/branding/logo.png` file (any small PNG) → wait <5 min or hard reload → courses page header logo updates.
- Drop a `manual-test/data/branding/login-banner.png` → reload login → banner is the dropped file, no rotation.
- (Optional) Stop the stack, edit `docker-compose.manual.yml` to add `APP_NAME=Test Hub`, `up --build -d` → `<h1>` and tab title both show "Test Hub".

If anything misbehaves, capture in the PR description as a follow-up; do not silently move on.

- [ ] **Step 3: Push + open the PR**

```
git push -u origin feat/customization-branding
gh pr create --base main --head feat/customization-branding --title "feat: operator branding — APP_* env vars + custom logos" --body "$(cat <<'EOF'
## Summary
- New env vars: \`APP_NAME\`, \`APP_SHORT_NAME\`, \`APP_DESCRIPTION\`, \`APP_THEME_COLOR\`, \`APP_BACKGROUND_COLOR\`. All optional; defaults preserve the current SkillGoblin look exactly.
- New drop-in files at \`data/branding/\`: \`logo.png\` (small square) and \`login-banner.png\` (wide login screen banner). Login-banner override disables the bundled rotation.
- Three new endpoints: \`/api/logo\`, \`/api/login-banner\`, \`/api/webmanifest\`. Static \`frontend/public/site.webmanifest\` removed.
- Default theme/bg color changed from \`#ffffff\` to \`#111827\` (Tailwind gray-900) — fixes the white mobile-chrome bar over the dark-by-default app.

## Spec / plan
- \`notes/customization-branding-design.md\`
- \`notes/customization-branding-plan.md\`

## Codex review
- \`notes/customization-branding-codex-prompt.md\`. Findings addressed in commits prefixed \`fix(branding):\`.

## Test plan
- ✅ Vitest + Playwright green in Docker.
- ✅ Manual smoke: default state preserves SkillGoblin branding; dropping override files in \`data/branding/\` swaps logos within the 5-min cache; setting \`APP_NAME\` flows through to title and h1 after restart.
EOF
)"
```

- [ ] **Step 4: Capture the PR URL** for the orchestrator's hand-off message.

---

## Self-review (against [notes/customization-branding-design.md](notes/customization-branding-design.md))

- **`readBranding` helper with hex validation** — Task 1 ✓
- **Defaults preserve current behavior** — Task 1 + Task 3 ✓
- **`#111827` default for theme/bg color** — Task 1 (`DEFAULT_COLOR`) ✓
- **`/api/logo` endpoint with bundled fallback** — Task 2 ✓
- **`/api/login-banner` endpoint with 404 fallback** — Task 2 ✓
- **`/api/webmanifest` endpoint with dynamic JSON** — Task 2 ✓
- **`runtimeConfig.public.branding` wiring** — Task 3 ✓
- **Static `site.webmanifest` removed; manifest link → `/api/webmanifest`** — Task 3 ✓
- **`<h1>` text from runtimeConfig in 3 places** — Task 4 ✓
- **Small-logo `<img src>` → `/api/logo`** — Task 5 ✓
- **Login page probe-and-fallback for banner** — Task 6 ✓
- **Bootstrap warning for invalid hex** — Task 7 ✓
- **README + docker-compose.example.yml docs** — Task 8 ✓
- **Codex review** — Task 9 ✓
- **Manual smoke + PR** — Task 10 ✓

No placeholders. Type/method names consistent (`readBranding`, `validHex`, `warnInvalidColors`, `branding.name`, `branding.shortName` etc. consistent across tasks). All tests run via Docker. All commits use the project's per-phase commit style without Claude attribution.
