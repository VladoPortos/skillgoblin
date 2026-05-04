# Category Suggestion Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clickable suggestion pills under the Category input in the Edit Course modal, surfacing existing categories whose name appears (as a word) in the course title, so an admin can one-click assign.

**Architecture:** A new pure helper module (`frontend/utils/categoryMatching.js`) tokenizes title and category strings (lowercase, alphanumeric split, stopword filter) and returns matching categories. `CourseEditor.vue` consumes it via a Vue `computed` and renders pills under the Category input only in edit mode. All matching is client-side from data the form already loads. Vitest unit-tests cover tokenization and matching.

**Tech Stack:** Nuxt 3, Vue 3 (Composition API, `<script setup>`), Tailwind CSS 4, Vitest 1.x.

**Reference spec:** `docs/superpowers/specs/2026-05-04-category-suggestion-pills-design.md`

**Working directory note:** All commands assume CWD is `frontend/` unless prefixed with `cd ../`. The repo root is one level up.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/utils/categoryMatching.js` | Create | Pure helper: `STOPWORDS`, `tokenize`, `findMatchingCategories`. No Vue imports. |
| `frontend/tests/unit/categoryMatching.test.js` | Create | Vitest unit tests for the helper. |
| `frontend/components/CourseEditor.vue` | Modify | Import helper, add `categorySuggestions` computed, render pill row under Category input in edit mode. |

---

## Task 1: Tokenize helper (TDD)

**Files:**
- Test: `frontend/tests/unit/categoryMatching.test.js`
- Create: `frontend/utils/categoryMatching.js`

- [ ] **Step 1: Create the failing test file**

Create `frontend/tests/unit/categoryMatching.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { tokenize, STOPWORDS } from '../../utils/categoryMatching.js';

describe('STOPWORDS', () => {
  it('is a Set of lowercase strings', () => {
    expect(STOPWORDS).toBeInstanceOf(Set);
    for (const word of STOPWORDS) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  it('contains common English fillers', () => {
    for (const word of ['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with']) {
      expect(STOPWORDS.has(word)).toBe(true);
    }
  });
});

describe('tokenize', () => {
  it('returns [] for null, undefined, empty string, and non-string input', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('')).toEqual([]);
    expect(tokenize(42)).toEqual([]);
    expect(tokenize({})).toEqual([]);
  });

  it('lowercases input', () => {
    expect(tokenize('Unreal')).toEqual(['unreal']);
  });

  it('splits on whitespace', () => {
    expect(tokenize('Godot Engine')).toEqual(['godot', 'engine']);
  });

  it('splits on punctuation (hyphens, slashes, dots, parens)', () => {
    expect(tokenize('sci-fi/action.game (3D)')).toEqual(['sci', 'fi', 'action', 'game', '3d']);
  });

  it('keeps alphanumeric tokens together', () => {
    expect(tokenize('3D')).toEqual(['3d']);
    expect(tokenize('Unreal5')).toEqual(['unreal5']);
  });

  it('drops stopwords', () => {
    expect(tokenize('a game in unreal')).toEqual(['game', 'unreal']);
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('handles consecutive separators without producing empty tokens', () => {
    expect(tokenize('foo   ---  bar')).toEqual(['foo', 'bar']);
  });

  it('strips leading and trailing separators', () => {
    expect(tokenize('  unreal  ')).toEqual(['unreal']);
    expect(tokenize('---unreal---')).toEqual(['unreal']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit -- categoryMatching`

Expected: FAIL with module-not-found error for `../../utils/categoryMatching.js`.

- [ ] **Step 3: Create the helper module with `STOPWORDS` and `tokenize`**

Create `frontend/utils/categoryMatching.js`:

```js
// Pure category-matching helpers used by the Edit Course modal to suggest
// existing categories whose name appears (as a word) in the course title.
// No Vue imports — keeps this unit-testable in a plain Node environment.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with',
  'on', 'at', 'by', 'from', 'into', 'your', 'my', 'our', 'this', 'that',
  'is', 'are'
]);

export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:unit -- categoryMatching`

Expected: PASS — all `STOPWORDS` and `tokenize` describe blocks green.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/utils/categoryMatching.js frontend/tests/unit/categoryMatching.test.js
git commit -m "feat(category-pills): add tokenize helper with stopword filter"
```

---

## Task 2: `findMatchingCategories` (TDD)

**Files:**
- Modify: `frontend/tests/unit/categoryMatching.test.js`
- Modify: `frontend/utils/categoryMatching.js`

- [ ] **Step 1: Add failing tests for `findMatchingCategories`**

Append to `frontend/tests/unit/categoryMatching.test.js` (after the existing `tokenize` describe):

```js
import { findMatchingCategories } from '../../utils/categoryMatching.js';

describe('findMatchingCategories', () => {
  it('returns [] when title is empty', () => {
    expect(findMatchingCategories('', ['Unreal', 'Godot'])).toEqual([]);
  });

  it('returns [] when categories list is empty', () => {
    expect(findMatchingCategories('Some unreal title', [])).toEqual([]);
  });

  it('returns [] when title is not a string', () => {
    expect(findMatchingCategories(null, ['Unreal'])).toEqual([]);
    expect(findMatchingCategories(undefined, ['Unreal'])).toEqual([]);
  });

  it('matches a single-word category found in the title', () => {
    expect(
      findMatchingCategories('Create a game in Unreal Engine 5', ['Unreal', 'Godot'])
    ).toEqual(['Unreal']);
  });

  it('matches case-insensitively but preserves the original category casing', () => {
    expect(
      findMatchingCategories('learn UNREAL today', ['Unreal'])
    ).toEqual(['Unreal']);
  });

  it('returns multiple matches in original input order', () => {
    expect(
      findMatchingCategories(
        'Create a SciFi Action Third Person Game in Unreal Engine 5',
        ['Unreal', 'Game', 'Godot', '3D']
      )
    ).toEqual(['Unreal', 'Game']);
  });

  it('matches alphanumeric categories like 3D against alphanumeric tokens in title', () => {
    expect(
      findMatchingCategories('Intro to 3D modeling', ['3D', 'Unreal'])
    ).toEqual(['3D']);
  });

  it('excludes the currently-selected category (case-insensitive)', () => {
    expect(
      findMatchingCategories(
        'Unreal Engine basics',
        ['Unreal', 'Godot'],
        { currentCategory: 'unreal' }
      )
    ).toEqual([]);
  });

  it('excludes "Uncategorized" (case-insensitive) even when it would match', () => {
    expect(
      findMatchingCategories(
        'uncategorized stuff',
        ['Uncategorized', 'Stuff']
      )
    ).toEqual(['Stuff']);
  });

  it('requires every token of a multi-word category to appear in the title', () => {
    expect(
      findMatchingCategories('Unreal tutorial', ['Unreal Engine'])
    ).toEqual([]);
    expect(
      findMatchingCategories('build a game in unreal engine 5', ['Unreal Engine'])
    ).toEqual(['Unreal Engine']);
  });

  it('skips a category whose only tokens are stopwords', () => {
    expect(
      findMatchingCategories('the and stuff', ['The And', 'Stuff'])
    ).toEqual(['Stuff']);
  });

  it('treats whitespace-only currentCategory as no current category', () => {
    expect(
      findMatchingCategories(
        'Unreal stuff',
        ['Unreal'],
        { currentCategory: '   ' }
      )
    ).toEqual(['Unreal']);
  });

  it('returns [] without throwing when categories contains non-strings', () => {
    expect(
      findMatchingCategories('Unreal stuff', ['Unreal', null, undefined, 42])
    ).toEqual(['Unreal']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:unit -- categoryMatching`

Expected: FAIL with "findMatchingCategories is not a function" or import error.

- [ ] **Step 3: Implement `findMatchingCategories`**

Append to `frontend/utils/categoryMatching.js`:

```js
export function findMatchingCategories(title, categories, options = {}) {
  if (typeof title !== 'string' || !Array.isArray(categories) || categories.length === 0) {
    return [];
  }

  const titleTokens = new Set(tokenize(title));
  if (titleTokens.size === 0) return [];

  const currentNormalized = typeof options.currentCategory === 'string'
    ? options.currentCategory.trim().toLowerCase()
    : '';

  const matches = [];
  for (const category of categories) {
    if (typeof category !== 'string') continue;

    const normalized = category.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (normalized === 'uncategorized') continue;
    if (currentNormalized && normalized === currentNormalized) continue;

    const catTokens = tokenize(category);
    if (catTokens.length === 0) continue;

    const allFound = catTokens.every(token => titleTokens.has(token));
    if (allFound) matches.push(category);
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:unit -- categoryMatching`

Expected: PASS — all tests in the file green.

- [ ] **Step 5: Run the full unit test suite to confirm no regressions**

Run: `cd frontend && npm run test:unit`

Expected: PASS — all existing tests still green, plus the new file's tests.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/utils/categoryMatching.js frontend/tests/unit/categoryMatching.test.js
git commit -m "feat(category-pills): add findMatchingCategories with stopword and current-category filters"
```

---

## Task 3: Wire suggestions into CourseEditor.vue

**Files:**
- Modify: `frontend/components/CourseEditor.vue`

This task has no automated test (it's a Vue template addition driven by a pure-function `computed` whose logic is already tested in Task 2). Verification is manual in the browser.

- [ ] **Step 1: Add the import and the computed in the `<script setup>` block**

In `frontend/components/CourseEditor.vue`, find the existing imports at the top of the `<script setup>` block (line 168):

```js
import { ref, computed, onMounted, watch } from 'vue';
```

Add directly below it:

```js
import { findMatchingCategories } from '~/utils/categoryMatching.js';
```

Then find the existing block of state declarations near line 186-189:

```js
// Add state for category autocomplete
const availableCategories = ref([]);
const filteredCategories = ref([]);
const showCategoryDropdown = ref(false);
```

Add directly after that block:

```js
const categorySuggestions = computed(() =>
  findMatchingCategories(
    formData.value.title,
    availableCategories.value,
    { currentCategory: formData.value.category }
  )
);
```

- [ ] **Step 2: Add the pill row in the template**

In the same file, find the Category column in the top grid (the second `<div>` of the `grid grid-cols-1 gap-6 sm:grid-cols-2`, the one whose `<label>` says "Category"). Inside it, the existing markup is:

```html
<div>
  <label for="courseCategory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
    Category
  </label>
  <div class="relative">
    <input
      type="text"
      id="courseCategory"
      v-model="formData.category"
      ...
    />
    <div v-if="showCategoryDropdown && filteredCategories.length > 0" class="absolute z-10 ...">
      <ul>
        <li v-for="category in filteredCategories" :key="category" @click="selectCategory(category)" class="...">
          {{ category }}
        </li>
      </ul>
    </div>
  </div>
</div>
```

Insert the pill row **after the closing `</div>` of `<div class="relative">`** and **before the closing `</div>` of the Category column**. The result should look like:

```html
<div>
  <label for="courseCategory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
    Category
  </label>
  <div class="relative">
    <input
      type="text"
      id="courseCategory"
      v-model="formData.category"
      @input="filterCategories"
      @focus="showCategoryDropdown = formData.category && filteredCategories.length > 0"
      @blur="handleCategoryBlur"
      class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
      placeholder="e.g. Programming"
      required
    />
    <div v-if="showCategoryDropdown && filteredCategories.length > 0" class="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
      <ul>
        <li v-for="category in filteredCategories" :key="category" @click="selectCategory(category)" class="py-2 px-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
          {{ category }}
        </li>
      </ul>
    </div>
  </div>
  <div
    v-if="isEditing && categorySuggestions.length > 0"
    class="mt-2 flex flex-wrap items-center gap-2"
  >
    <span class="text-xs text-gray-500 dark:text-gray-400">Suggested:</span>
    <button
      v-for="suggestion in categorySuggestions"
      :key="suggestion"
      type="button"
      @click="formData.category = suggestion"
      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-primary-900/40 dark:text-primary-200 dark:hover:bg-primary-900/60"
      :aria-label="`Set category to ${suggestion}`"
    >
      {{ suggestion }}
    </button>
  </div>
</div>
```

Key constraints (re-check after editing):
- `type="button"` on the pill — prevents form submission.
- `v-if` guards on both `isEditing` AND `categorySuggestions.length > 0` — pill row never appears in the new-course flow and never appears empty.
- The pill row is OUTSIDE the `<div class="relative">` so it doesn't get covered by the autocomplete dropdown.

- [ ] **Step 3: Run the full unit test suite to confirm nothing broke**

Run: `cd frontend && npm run test:unit`

Expected: PASS — including the categoryMatching tests from Task 2. (No new automated tests in this task, but a regression check is cheap.)

- [ ] **Step 4: Manual browser verification**

Start the dev server and verify the feature end-to-end. The dev server should already be configured per the repo's docker-compose setup. Two options:

**Option A — Docker compose:** `cd .. && docker compose up -d` then open the app at the URL printed in the compose file (typically `http://localhost:3000` or the port set in `docker-compose.yml`).

**Option B — Local Nuxt dev (if SQLite path is writable on the host):** `cd frontend && npm run dev` then open `http://localhost:3000`.

Then in the browser:

1. Log in as an admin.
2. Make sure at least one category exists by editing one course and setting its category to e.g. `Unreal`. Save. Confirm a category pill `Unreal` appears at the top of the course list filter row.
3. Find a course in `Uncategorized` whose title contains "Unreal" (e.g., the screenshot's "Create a SciFi Action Third Person Game in Unreal Engine 5"). If none exists, manually rename one course title to include the word.
4. Click the pencil icon to open Edit Course on that uncategorized course.
5. **Verify:** A "Suggested:" label and a clickable `Unreal` pill appear directly below the Category input.
6. Click the `Unreal` pill. **Verify:** the Category input fills with `Unreal`. The pill disappears (it now matches the current category).
7. Click Save Course. **Verify:** the modal closes and the course now shows in the `Unreal` category filter.
8. Re-open Edit Course on the same course. **Verify:** no pill row appears (current category already matches the only matching suggestion).
9. Click the `+` button to open New Course. **Verify:** even if you type a title containing "Unreal", **no** pill row appears (edit mode only).
10. Edit a course whose title shares no words with any category. **Verify:** no pill row renders.

Document any deviation from expected behavior — that's a bug to fix before committing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/components/CourseEditor.vue
git commit -m "feat(category-pills): show suggestion pills in Edit Course modal"
```

---

## Self-Review Checklist (run before handing off to executor)

- ✅ **Spec coverage:**
  - Pure helper module → Task 1 + Task 2.
  - `STOPWORDS` set → Task 1 step 3.
  - `tokenize` with all behaviors (lowercase, alphanumeric split, drop stopwords, drop empty, null-safe) → Task 1 tests.
  - `findMatchingCategories` with current-category exclusion, "Uncategorized" exclusion, all-tokens-must-match, original casing, original order → Task 2 tests + impl.
  - Vitest setup uses existing `tests/unit/` include pattern → no config change needed.
  - `CourseEditor.vue` import + computed + pill row in Category column, edit-mode only → Task 3.
  - `type="button"` on pill (no form submit) → Task 3 step 2.
  - Replaces category on click (no auto-save) → Task 3 step 2.
  - Tailwind classes follow primary-tinted, dark-mode aware pattern → Task 3 step 2.

- ✅ **Placeholder scan:** No "TBD", "TODO", "implement later", or test-without-code. Every code step has full code. Every command has expected output.

- ✅ **Type / name consistency:**
  - `STOPWORDS` is a `Set` in both Task 1 impl and the test that checks `toBeInstanceOf(Set)`.
  - `tokenize(text)` signature matches its tests (single arg).
  - `findMatchingCategories(title, categories, options)` with `options.currentCategory` matches test calls and impl signature.
  - Vue computed name `categorySuggestions` matches its template usage in Task 3 step 2.
  - Import path `~/utils/categoryMatching.js` (Task 3) matches the file path `frontend/utils/categoryMatching.js` (Task 1) — Nuxt's `~` alias points to `frontend/`.

- ✅ **Working-tree caveat:** the user's working tree shows phantom-modified files from a prior CRLF/invisible-char cleanup. All `git add` commands in this plan name explicit paths (no `git add -A` / `git add .`) so those phantom mods will not be swept into commits.
