# PR-D — Recently added discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Newest first" sort to `/api/courses` and a small `NEW` badge on course cards added in the last `NEW_BADGE_DAYS` (default 7).

**Architecture:** The existing `getAllCoursesFromDb()` returns `data` (a JSON blob) without `created_at`. We extend it to include `created_at` so the API handler can sort and compute `isNew` server-side. A small new util `recencyHelpers.js` owns the read-once env parse and the `isNew` test. The `CourseCard.vue` adds a conditional pill, the courses page adds a sort dropdown that round-trips through the URL.

**Tech Stack:** Nuxt 3 / Nitro, better-sqlite3, Vue 3 SFC, Tailwind. Vitest unit + Playwright e2e.

**Spec:** [pr-d-recently-added.md](../specs/2026-05-04-pr-d-recently-added.md)
**Branch:** `feat/recently-added` (cut from `main` at task 1)

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `frontend/server/utils/recencyHelpers.js` | `parseNewBadgeDays()` (env), `isWithinNewWindow(createdAt, days)` |
| `frontend/tests/unit/recencyHelpers.test.js` | Unit tests for the helpers |
| `frontend/tests/unit/coursesSort.test.js` | Unit tests for the sort param branch in `getAllCoursesFromDb` (or its replacement) |
| `frontend/tests/e2e/recently-added.spec.js` | E2E for sort + NEW badge |

### Modified files

| Path | Change |
|---|---|
| `frontend/server/utils/courseDatabase.js` | Add `getAllCoursesWithMeta()` that returns each course with `created_at` |
| `frontend/server/api/courses.js` | Use the new fetcher, accept `?sort=newest`, compute `isNew` per item |
| `frontend/components/course/CourseCard.vue` | Render `NEW` pill when `course.isNew` is true |
| `frontend/pages/courses/index.vue` | Sort dropdown, URL state plumbing |
| `README.md` | Document `NEW_BADGE_DAYS` env var and Newest-first sort |

---

## Task list

### Task 1: Cut the feature branch

- [ ] **Step 1.1: Update main and cut branch**

```bash
git fetch origin
git switch -c feat/recently-added origin/main
```

---

### Task 2: Recency helpers — failing test

**Files:**
- Create: `frontend/tests/unit/recencyHelpers.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `frontend/tests/unit/recencyHelpers.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { parseNewBadgeDays, isWithinNewWindow } from '../../server/utils/recencyHelpers.js';

describe('parseNewBadgeDays', () => {
  it('returns 7 by default when env is missing', () => {
    expect(parseNewBadgeDays(undefined)).toBe(7);
    expect(parseNewBadgeDays('')).toBe(7);
  });

  it('parses a positive integer', () => {
    expect(parseNewBadgeDays('14')).toBe(14);
  });

  it('returns 0 when the env value is "0" (badge disabled)', () => {
    expect(parseNewBadgeDays('0')).toBe(0);
  });

  it('returns 7 when the env value is invalid', () => {
    expect(parseNewBadgeDays('abc')).toBe(7);
    expect(parseNewBadgeDays('-5')).toBe(7);
    expect(parseNewBadgeDays('3.5')).toBe(7);
  });
});

describe('isWithinNewWindow', () => {
  const now = new Date('2026-05-04T12:00:00Z').getTime();

  it('returns true for a row created 1 day ago with a 7-day window', () => {
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(oneDayAgo, 7, now)).toBe(true);
  });

  it('returns false for a row created 30 days ago with a 7-day window', () => {
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(thirtyDaysAgo, 7, now)).toBe(false);
  });

  it('returns false when the window is 0 (badge disabled)', () => {
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(oneDayAgo, 0, now)).toBe(false);
  });

  it('returns false when createdAt is null or undefined', () => {
    expect(isWithinNewWindow(null, 7, now)).toBe(false);
    expect(isWithinNewWindow(undefined, 7, now)).toBe(false);
  });

  it('returns false when createdAt is unparseable', () => {
    expect(isWithinNewWindow('not a date', 7, now)).toBe(false);
  });

  it('handles SQLite "YYYY-MM-DD HH:MM:SS" format (no T separator)', () => {
    const sqliteFormat = '2026-05-03 12:00:00';
    expect(isWithinNewWindow(sqliteFormat, 7, now)).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
npx vitest run tests/unit/recencyHelpers.test.js
```

Expected: FAIL — module not found.

---

### Task 3: Recency helpers — implementation

**Files:**
- Create: `frontend/server/utils/recencyHelpers.js`

- [ ] **Step 3.1: Implement**

Create `frontend/server/utils/recencyHelpers.js`:

```javascript
const DEFAULT_DAYS = 7;

// Read NEW_BADGE_DAYS from process.env via this helper so the parsing is
// centralized and testable. Accepts a string (or undefined) and returns a
// non-negative integer. Invalid / negative / fractional inputs fall back to
// DEFAULT_DAYS so a misconfigured env var doesn't silently disable the badge.
export function parseNewBadgeDays(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DAYS;
  if (!/^\d+$/.test(String(raw))) return DEFAULT_DAYS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_DAYS;
  return n;
}

// Returns true iff `createdAt` (an ISO-ish or SQLite-format string) is
// within `days` days of `now` (a millisecond timestamp). `now` is injectable
// so unit tests are deterministic.
export function isWithinNewWindow(createdAt, days, now = Date.now()) {
  if (!createdAt) return false;
  if (!days || days <= 0) return false;
  // SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" without a 'T'.
  // Date can't always parse that on every JS engine — normalize.
  const normalized = typeof createdAt === 'string'
    ? createdAt.replace(' ', 'T') + (/\dZ?$/.test(createdAt) ? '' : 'Z')
    : createdAt;
  const ts = new Date(normalized).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < days * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 3.2: Run test to verify it passes**

```bash
npx vitest run tests/unit/recencyHelpers.test.js
```

Expected: PASS — 11 tests green.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/server/utils/recencyHelpers.js frontend/tests/unit/recencyHelpers.test.js
git commit -m "feat(recency): NEW_BADGE_DAYS parser and within-window predicate"
```

---

### Task 4: Database fetcher with `created_at`

**Files:**
- Modify: `frontend/server/utils/courseDatabase.js`
- Create: `frontend/tests/unit/coursesSort.test.js`

- [ ] **Step 4.1: Write the failing test**

Create `frontend/tests/unit/coursesSort.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

// We exercise the helper against an in-memory SQLite to keep the test fast
// and independent of the real DB.
import { getAllCoursesWithMeta } from '../../server/utils/courseDatabase.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail TEXT,
      thumbnail_data BLOB,
      folder_name TEXT,
      category TEXT DEFAULT 'Uncategorized',
      release_date TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Older row, then newer row
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('old-1', 'Old', JSON.stringify({ id: 'old-1', title: 'Old' }), '2020-01-01 00:00:00');
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('new-1', 'New', JSON.stringify({ id: 'new-1', title: 'New' }), '2026-05-03 00:00:00');
});
afterEach(() => {
  if (db) db.close();
});

describe('getAllCoursesWithMeta', () => {
  it('returns rows with created_at attached to the parsed data', () => {
    const rows = getAllCoursesWithMeta(db);
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map['old-1'].created_at).toBe('2020-01-01 00:00:00');
    expect(map['new-1'].created_at).toBe('2026-05-03 00:00:00');
    expect(map['new-1'].title).toBe('New');
  });

  it('orders by title ASC by default', () => {
    const rows = getAllCoursesWithMeta(db);
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });

  it('orders by created_at DESC when sort is "newest"', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'newest' });
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });

  it('falls back to title for unknown sort values', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'garbage' });
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });
});
```

- [ ] **Step 4.2: Run the test — it fails**

```bash
npx vitest run tests/unit/coursesSort.test.js
```

Expected: FAIL — `getAllCoursesWithMeta is not a function`.

- [ ] **Step 4.3: Add the helper to `courseDatabase.js`**

Open `frontend/server/utils/courseDatabase.js`. Add this function near the
other read helpers (after `getAllCoursesFromDb`):

```javascript
// Like getAllCoursesFromDb but includes created_at and supports a sort param.
// Accepts an explicit `db` for unit testing; defaults to the singleton.
export const getAllCoursesWithMeta = (dbInstance = null, opts = {}) => {
  const db = dbInstance || getDb();
  const sort = opts.sort === 'newest' ? 'created_at DESC, id ASC' : 'title ASC';
  try {
    const rows = db
      .prepare(`SELECT data, created_at FROM courses ORDER BY ${sort}`)
      .all();
    return rows.map((r) => {
      const parsed = JSON.parse(r.data);
      return { ...parsed, created_at: r.created_at };
    });
  } catch (err) {
    console.error('Error retrieving courses with meta:', err);
    return [];
  }
};
```

- [ ] **Step 4.4: Run the tests — they pass**

```bash
npx vitest run tests/unit/coursesSort.test.js
```

Expected: PASS — 4 tests green.

- [ ] **Step 4.5: Commit**

```bash
git add frontend/server/utils/courseDatabase.js frontend/tests/unit/coursesSort.test.js
git commit -m "feat(db): getAllCoursesWithMeta with optional newest sort"
```

---

### Task 5: Wire sort + isNew into the courses listing endpoint

**Files:**
- Modify: `frontend/server/api/courses.js`

- [ ] **Step 5.1: Use the new fetcher and compute `isNew`**

Open `frontend/server/api/courses.js`. Replace the existing import:

```javascript
import { getAllCoursesFromDb, getCourseFromDb } from '../utils/courseDatabase';
```

with:

```javascript
import { getAllCoursesFromDb, getAllCoursesWithMeta, getCourseFromDb } from '../utils/courseDatabase';
import { parseNewBadgeDays, isWithinNewWindow } from '../utils/recencyHelpers.js';
```

In the `else` branch where all courses are returned (the block starting with
`// Get all courses`), replace `const courses = getAllCoursesFromDb();` with:

```javascript
const url = new URL(event.node.req.url, 'http://localhost');
const sortParam = url.searchParams.get('sort');
const sort = sortParam === 'newest' ? 'newest' : 'title';
if (sortParam && sort !== sortParam) {
  console.warn(`[courses] unknown sort "${sortParam}", falling back to title`);
}
const courses = getAllCoursesWithMeta(null, { sort });
const newDays = parseNewBadgeDays(process.env.NEW_BADGE_DAYS);
const now = Date.now();
for (const c of courses) {
  c.isNew = isWithinNewWindow(c.created_at, newDays, now);
}
```

> Below this block the existing code already pulls `category`, `searchQuery`,
> `page`, `limit` from the same `url` object. To avoid declaring `url` twice,
> delete the second `const url = new URL(...)` line that appears later in the
> same function and let the one you just added serve both blocks. Move the
> declaration up if needed so it's defined before category/search/page/limit reads.

- [ ] **Step 5.2: Smoke-test by hand against the dev stack**

```bash
docker compose up --build -d
# Wait for "Listening on http://0.0.0.0:3000"
curl -s 'http://localhost:3000/api/courses?sort=newest&limit=2' | head -c 300
docker compose down
```

Expected: response includes `items` array with `isNew` booleans on each item.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/server/api/courses.js
git commit -m "feat(api): support sort=newest and isNew flag on /api/courses"
```

---

### Task 6: NEW badge on CourseCard

**Files:**
- Modify: `frontend/components/course/CourseCard.vue`

- [ ] **Step 6.1: Add the badge**

In the template, find the block:

```vue
<div class="relative h-40 overflow-hidden" @click="navigateToCourse">
  <img ...>
```

Inside the `<div class="relative h-40 overflow-hidden">`, just after the `<img>`
or placeholder block but before the Admin Edit Button block, add:

```vue
<!-- NEW badge -->
<div
  v-if="course.isNew"
  data-testid="course-new-badge"
  class="absolute top-2 left-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-500 text-white shadow"
  :title="newBadgeTitle"
>
  NEW
</div>
```

In the `<script setup>` section, add a computed for the tooltip:

```javascript
const newBadgeTitle = computed(() => {
  if (!props.course.created_at) return 'Recently added';
  try {
    const d = new Date(String(props.course.created_at).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return 'Recently added';
    return `Added ${d.toLocaleDateString()}`;
  } catch {
    return 'Recently added';
  }
});
```

- [ ] **Step 6.2: Commit**

```bash
git add frontend/components/course/CourseCard.vue
git commit -m "feat(card): NEW badge for recently-added courses"
```

---

### Task 7: Sort dropdown on the courses page

**Files:**
- Modify: `frontend/pages/courses/index.vue`

- [ ] **Step 7.1: Add a sort ref and a dropdown next to the search bar**

Open `frontend/pages/courses/index.vue`. In the script section, near the
existing `selectedCategory`, `searchQuery` refs, add:

```javascript
const sortMode = ref('title'); // 'title' | 'newest'
```

In the template, find the line `<!-- Search Bar -->` and the `<SearchBar ... />`
that follows it. Wrap the search bar in a flex container and add the sort
dropdown next to it:

```vue
<!-- Search + sort -->
<div class="flex flex-col sm:flex-row sm:items-center gap-3 mt-3">
  <div class="flex-1">
    <SearchBar
      v-model:search-query="searchQuery"
      placeholder="Search courses..."
    />
  </div>
  <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
    <span class="mr-2">Sort:</span>
    <select
      data-testid="course-sort"
      v-model="sortMode"
      class="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-sm px-2 py-1"
    >
      <option value="title">Title (A–Z)</option>
      <option value="newest">Newest first</option>
    </select>
  </label>
</div>
```

> Remove the *old* `<SearchBar ... />` element that previously stood alone — your new wrapper now owns it.

- [ ] **Step 7.2: Plumb `sortMode` through `fetchCourses`**

Find the `fetchCourses` function. After the existing `if (searchQuery.value) { queryParams.append('search', searchQuery.value); }` block, add:

```javascript
if (sortMode.value && sortMode.value !== 'title') {
  queryParams.append('sort', sortMode.value);
}
```

And add a watcher near the existing `watch(selectedCategory, ...)`:

```javascript
watch(sortMode, () => {
  currentPage.value = 1;
  fetchCourses();
});
```

In `onBeforeMount`, after the existing search-param read, add:

```javascript
const sortParam = urlParams.get('sort');
if (sortParam === 'newest') sortMode.value = 'newest';
```

- [ ] **Step 7.3: Smoke-test in the dev stack**

```bash
docker compose up --build -d
```

Open the courses page, switch the sort dropdown to "Newest first" and verify:
- The order changes
- The URL updates to include `?sort=newest`
- A reload preserves the sort

```bash
docker compose down
```

- [ ] **Step 7.4: Commit**

```bash
git add frontend/pages/courses/index.vue
git commit -m "feat(courses): sort dropdown round-trips through the URL"
```

---

### Task 8: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 8.1: Document `NEW_BADGE_DAYS` in the env table**

Find the configuration env table in `README.md`. Add a row in alphabetical
position:

```markdown
| `NEW_BADGE_DAYS` | No | `7` | How recent (in days) a course must be to render the `NEW` badge on its card. Set to `0` to disable the badge entirely. |
```

Also add a small subsection under "Content management" describing the
"Newest first" sort:

```markdown
### Newest-first sort

The courses page has a sort dropdown next to the search bar. Pick "Newest
first" to order courses by `created_at DESC` (most recently added first).
The choice is stored in the URL so reloads and bookmarks preserve it.
```

- [ ] **Step 8.2: Commit**

```bash
git add README.md
git commit -m "docs: document NEW_BADGE_DAYS and Newest-first sort"
```

---

### Task 9: Playwright e2e — newest sort + badge

**Files:**
- Create: `frontend/tests/e2e/recently-added.spec.js`

- [ ] **Step 9.1: Write the e2e**

Create `frontend/tests/e2e/recently-added.spec.js`:

```javascript
import { test, expect } from '@playwright/test';

const ADMIN_NAME = process.env.ADMIN_NAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-password';

async function loginAsAdmin(page) {
  await page.goto('/');
  await page.click(`[data-testid=user-tile-${ADMIN_NAME}]`).catch(() => {});
  await page.fill('input[type=password]', ADMIN_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/courses/);
}

test.describe('recently-added discovery', () => {
  test('newest sort param is round-tripped through the URL', async ({ page }) => {
    await loginAsAdmin(page);
    await page.selectOption('[data-testid=course-sort]', 'newest');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toMatch(/sort=newest/);
    await page.reload();
    await expect(page.locator('[data-testid=course-sort]')).toHaveValue('newest');
  });

  test('the API returns isNew booleans on items', async ({ request }) => {
    const r = await request.get('/api/courses?limit=20');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.items) {
      expect(typeof item.isNew).toBe('boolean');
    }
  });

  test('NEW badge renders for at least one course (assumes test fixture has recent inserts)', async ({ page, request }) => {
    await loginAsAdmin(page);
    await page.waitForSelector('[data-testid=course-new-badge], main', { timeout: 5000 });

    // If the fixture has no recent rows, this test is a no-op rather than a flake.
    const r = await request.get('/api/courses?limit=20');
    const body = await r.json();
    const hasAnyNew = body.items.some((i) => i.isNew);
    if (!hasAnyNew) {
      test.skip(true, 'No recent courses in fixture; nothing to assert');
    }
    await expect(page.locator('[data-testid=course-new-badge]').first()).toBeVisible();
  });
});
```

- [ ] **Step 9.2: Run the dockerized test stack**

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full vitest + Playwright suites green, including the three new tests.

- [ ] **Step 9.3: Commit**

```bash
git add frontend/tests/e2e/recently-added.spec.js
git commit -m "test(e2e): newest sort url plumbing + NEW badge presence"
```

---

### Task 10: Codex review

- [ ] **Step 10.1: Run codex on the diff**

```bash
git diff origin/main...HEAD > /tmp/pr-d-diff.txt
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task \
  "Review this Nuxt + SQLite PR. Focus on: \
  (1) SQL-injection risk in the sort param (must be allow-listed, not interpolated raw), \
  (2) timezone bugs in the isNew computation, \
  (3) any backwards-compat regression on /api/courses for clients not passing sort. \
  Reply with HIGH/MEDIUM/LOW findings. Diff:\n\n$(head -c 200000 /tmp/pr-d-diff.txt)"
```

Expected: structured review.

- [ ] **Step 10.2: Apply HIGH-severity fixes if any, commit, re-run tests**

If codex flags HIGH findings, fix and commit `fix(pr-d): address codex review findings`. Otherwise skip.

---

### Task 11: Push and open the PR

- [ ] **Step 11.1: Push and open PR**

```bash
git push -u origin feat/recently-added
gh pr create \
  --base main \
  --title "feat(courses): newest-first sort + NEW badge" \
  --body "$(cat <<'EOF'
## Summary
- `/api/courses` now accepts `?sort=newest` and orders by `created_at DESC`
- Courses added within the last `NEW_BADGE_DAYS` (default 7, env-tuneable, 0 disables) render a small `NEW` pill on the card
- New sort dropdown on the courses page; choice round-trips through the URL

## Test plan
- [x] Vitest unit suite green (new: recencyHelpers, coursesSort)
- [x] Playwright e2e green (new: recently-added)
- [x] Manual smoke: switched sort, verified order changes and URL updates

## Spec
docs/superpowers/specs/2026-05-04-pr-d-recently-added.md
EOF
)"
```

- [ ] **Step 11.2: Update master tracker**

Edit overview, tick PR-D boxes, commit + push:

```bash
git add docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md
git commit -m "docs(tracker): PR-D complete"
git push
```

---

## Verification gate

- [ ] All new unit tests pass
- [ ] All new e2e tests pass
- [ ] Full existing vitest + Playwright suites green
- [ ] Codex sweep: no HIGH findings open
- [ ] README documents `NEW_BADGE_DAYS`
- [ ] Visual smoke: badge + sort dropdown screenshotted
- [ ] Master tracker PR-D boxes ticked
