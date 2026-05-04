# Category Suggestion Pills — Design

**Date:** 2026-05-04
**Status:** Approved (pending spec review)
**Scope:** Frontend admin UX

## Problem

When an admin opens the Edit Course modal for an existing course (default category "Uncategorized"), there is no quick way to assign one of the existing categories. The admin has to remember category names and type them into the autocomplete. Mis-spelling creates a brand-new category. The admin wants suggestion pills that surface existing categories whose name appears in the course title, so they can one-click assign.

## Goals

- Show clickable suggestion pills under the Category input in the Edit Course modal whenever a known category name appears (as a word) in the course title.
- Clicking a pill sets the Category field to that category's original casing. Save still requires the user to click "Save Course".
- Only triggered when the Edit Course modal is opened (and reactively as the title changes within that modal). No bulk scans, no work outside this one course.

## Non-goals

- New-course creation flow. Pills do not render there.
- Multi-category support. The data model still stores a single category string.
- Server-side suggestion. All matching happens client-side from data the form already loads.
- Auto-saving on pill click.
- Suggesting categories based on description, thumbnail, or any field other than the title.

## User scenarios

1. Admin opens Edit Course on "Create a SciFi Action Third Person Game in Unreal Engine 5". Categories include "Unreal", "3D", "Game". Pills "Unreal" and "Game" appear under the Category input. Admin clicks "Unreal" → field becomes "Unreal". Admin clicks Save.
2. Admin opens Edit Course on a course whose title shares no words with any existing category. No pill row renders.
3. Admin opens Edit Course on a course whose category is already "Unreal" and whose title contains "unreal". The "Unreal" pill is suppressed (already selected). Other matches still show.
4. Admin opens Edit Course on a fresh install where no categories exist yet. No pill row renders.

## Architecture

Two new files plus one targeted edit:

| File | Change |
|---|---|
| `frontend/utils/categoryMatching.js` | new — pure helper module |
| `frontend/tests/unit/categoryMatching.test.js` | new — Vitest unit tests |
| `frontend/components/CourseEditor.vue` | edit — add computed + pill row |

Splitting the matching logic out of the component keeps tokenization testable and the component a thin consumer.

### `frontend/utils/categoryMatching.js`

Pure module, no Vue imports. Exports:

- **`STOPWORDS`** — `Set<string>` of common English filler words to drop from both titles and category names before matching:
  ```
  the, a, an, and, or, of, to, in, for, with, on, at, by, from, into,
  your, my, our, this, that, is, are
  ```
  Kept short and visible so a reader can audit it. Extendable later if real-world matches turn out noisy.

- **`tokenize(text)`** → `string[]`
  - Returns `[]` for `null`, `undefined`, non-string, or empty input.
  - Lowercases the string.
  - Splits on non-alphanumeric characters (regex `/[^a-z0-9]+/`), so `"SciFi"` → `["scifi"]`, `"3D"` → `["3d"]`, hyphens / punctuation / whitespace all act as separators.
  - Drops empty strings.
  - Drops tokens present in `STOPWORDS`.

- **`findMatchingCategories(title, categories, options)`** → `string[]`
  - `title`: string (the course title)
  - `categories`: `string[]` (available category names, original casing)
  - `options.currentCategory`: optional string (the category currently set on the course)
  - Algorithm:
    1. `titleTokens = new Set(tokenize(title))`. If empty, return `[]`.
    2. For each `category` in `categories`, in original order:
       - Let `normalized = category.trim().toLowerCase()`.
       - Skip if `normalized === options.currentCategory?.trim().toLowerCase()`.
       - Skip if `normalized === "uncategorized"`.
       - `catTokens = tokenize(category)`. Skip if `catTokens.length === 0`.
       - Include the original `category` if **every** token in `catTokens` is in `titleTokens`.
    3. Return the matched categories with original casing preserved, in their original input order.

### `frontend/components/CourseEditor.vue`

- **Import:** `import { findMatchingCategories } from '~/utils/categoryMatching';` (or relative path consistent with other component imports).
- **Computed:**
  ```js
  const categorySuggestions = computed(() =>
    findMatchingCategories(
      formData.value.title,
      availableCategories.value,
      { currentCategory: formData.value.category }
    )
  );
  ```
- **Template** — Inside the Category column (the second `<div>` of the top grid row, the one whose `<label>` says "Category"), the existing markup is a `<div class="relative">` wrapping the input and the autocomplete dropdown. The pill row goes **after that `<div class="relative">…</div>` block** and **before the closing `</div>` of the Category column**, so it sits visually below the input. Markup:
  ```html
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
      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-200 dark:hover:bg-primary-800 transition-colors"
      :aria-label="`Set category to ${suggestion}`"
    >
      {{ suggestion }}
    </button>
  </div>
  ```
  - `type="button"` so the click never submits the form.
  - Only renders in edit mode (`isEditing === true`) and only when there is at least one suggestion.
  - Tailwind classes match the canonical interactive pill pattern in `frontend/components/course/CourseCard.vue` (rounded-full, primary-tinted, dark-mode aware, `transition-colors`).

### `frontend/tests/unit/categoryMatching.test.js`

Vitest covers (one assertion per behavior):

- `tokenize` lowercases (`"Unreal"` → `["unreal"]`).
- `tokenize` splits on punctuation and whitespace (`"sci-fi action"` → `["sci", "fi", "action"]`).
- `tokenize` keeps alphanumerics together (`"3D"` → `["3d"]`, `"unreal5"` → `["unreal5"]`).
- `tokenize` drops stopwords (`"a game in unreal"` → `["game", "unreal"]`).
- `tokenize` returns `[]` for `null`, `undefined`, `""`, and non-string input.
- `findMatchingCategories` matches a single-word category in the title.
- `findMatchingCategories` returns multiple matches in original input order.
- `findMatchingCategories` excludes the `currentCategory` (case-insensitive).
- `findMatchingCategories` excludes `"Uncategorized"` (case-insensitive).
- `findMatchingCategories` returns `[]` when title or categories list is empty.
- `findMatchingCategories` requires **all** tokens of a multi-word category to appear in the title (e.g., `"Unreal Engine"` matches title `"unreal engine 5"` but not `"unreal tutorial"`).
- `findMatchingCategories` does not match a category whose only tokens are stopwords (defensive — shouldn't happen in practice).

## Behavior summary

- **Trigger:** edit mode only. New-course mode never renders the pill row.
- **Reactive:** pills recompute as `formData.title`, `formData.category`, or `availableCategories` change. No watchers needed; the `computed` handles it.
- **Click effect:** replaces `formData.category` with the picked category's original casing. User must still click Save.
- **No matches / no categories:** pill row simply does not render. No empty state.
- **Already-selected category:** suppressed from the pill list.

## Risks / open questions

- **Stopword list completeness:** the curated list covers common English fillers but is not exhaustive. If users see noisy matches in practice (e.g., short common words leaking through), extend the set. Easy follow-up.
- **Categories with only stopwords:** a category named `"The And"` would tokenize to `[]` and never match. Acceptable — such names are pathological.
- **Single-character categories:** e.g., a hypothetical category `"C"` would match any title containing the letter "c" as a standalone token (e.g., `"build a C compiler"`). Categories of this shape are unlikely; not worth special-casing.
- **i18n:** stopwords are English-only. The UI is currently English-only, so this is consistent.

## Out of scope (future ideas, not for this spec)

- Suggestion ranking / scoring (e.g., longer matches first).
- Suggesting categories from description text.
- Multi-category support.
- Bulk re-categorization across all courses.
