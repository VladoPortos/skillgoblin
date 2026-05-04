# PR-D — Recently added discovery

**Parent:** [feature pack overview](./2026-05-04-skillgoblin-feature-pack-overview.md)
**Branch:** `feat/recently-added`
**Scope:** F6 (recently added sort + `NEW` badge)

---

## Goal

Help users notice newly-added content without adding notifications or any
social surface area. Two surfaces:

1. A `NEW` badge on course cards added in the last `N` days (default 7).
2. A "Newest" sort option on the courses page that orders by `created_at DESC`.

## Non-goals

- No notifications, no email, no push.
- No "since you last visited" personalization.
- No "trending" or popularity ranking.
- No detection of *content* changes inside an existing course folder (would require deeper file watcher rework — out of scope).

---

## Approach

### Reuse existing schema

`courses.created_at` is already populated on insert
([001_initial.js:40](../../../frontend/server/migrations/001_initial.js)) and
the watcher's INSERT path uses `CURRENT_TIMESTAMP`. No migration needed.

### F6.a — Sort param

Modify `/api/courses` (the listing endpoint) to accept `?sort=newest`. Default
remains `title ASC` to preserve existing behavior.

Allowed values:

- `title` (default) — `ORDER BY title ASC`
- `newest` — `ORDER BY created_at DESC, id ASC`

Anything else falls back to `title` with a console warning.

`categoryCounts` is independent of sort — that pagination metadata is computed
from the unsorted base set and returned as today.

### F6.b — `NEW` badge

`NEW_BADGE_DAYS` env var:

- Default: `7`
- `0` disables the badge entirely.
- Read at request time (no restart required to change).

The `/api/courses` endpoint returns each item with an `isNew` boolean,
computed server-side as: `created_at > NOW() - NEW_BADGE_DAYS days`. Server
computation keeps client UTC offsets out of the equation.

In [CourseCard.vue](../../../frontend/components/course/CourseCard.vue), when
`course.isNew` is true, render a small pill badge in the top-right corner:

```
NEW
```

Use the existing primary color tokens (`bg-primary-500`, `text-white`). On
hover, show "Added <relative-time>" tooltip.

### F6.c — Sort dropdown UI

In [pages/courses/index.vue](../../../frontend/pages/courses/index.vue), add a
small sort dropdown next to the search bar:

```
Sort by: [Title (A-Z) ▾]
         [Newest first ]
```

Sort persists in the URL query string (already handled — extend the existing
URL-param plumbing) and survives reloads.

---

## Files changed

### Modified

- `frontend/server/api/courses.js` — accept `sort` param, compute `isNew`, read `NEW_BADGE_DAYS`
- `frontend/components/course/CourseCard.vue` — render `NEW` pill when `course.isNew`
- `frontend/pages/courses/index.vue` — sort dropdown, URL state plumbing
- `README.md` — document `NEW_BADGE_DAYS` env var

### Added

- `frontend/tests/unit/coursesSort.test.js`
- `frontend/tests/e2e/recently-added.spec.js`

No schema changes.

---

## Test plan

### Unit tests

1. `/api/courses?sort=newest` returns courses ordered by `created_at DESC`.
2. `/api/courses?sort=garbage` falls back to `title ASC` and logs a warning.
3. `isNew` is true for a course with `created_at = now - 1 day` and `NEW_BADGE_DAYS=7`.
4. `isNew` is false for a course with `created_at = now - 30 days` and `NEW_BADGE_DAYS=7`.
5. `isNew` is false for every course when `NEW_BADGE_DAYS=0`.

### E2E tests (Playwright)

1. Two-course fixture: course A inserted 1 day ago, course B inserted 30 days ago. Default sort: A and B appear, but in title order. Switch to "Newest first" → A is first.
2. With `NEW_BADGE_DAYS=7` (default), course A renders a `NEW` badge; course B does not.
3. Switch sort to "Newest first" → URL contains `?sort=newest`. Reload the page → sort persists.
4. Hover the `NEW` badge → tooltip with relative time appears.
5. Combine `category=foo&sort=newest` → both filters applied, badge still rendered correctly.

### Manual sign-off

- On a dev instance with real content, verify the sort produces expected order.
- Visually confirm the badge does not overlap the play button or progress overlay on a card.

---

## Edge cases

- **Course `created_at` is `NULL`** (extremely unlikely; defaulted to CURRENT_TIMESTAMP, but safety net): treat as "not new", sort to the end of the newest list.
- **Server clock skew**: trust the DB clock; do not pass timestamps from the client.
- **Many courses are simultaneously "new"** (large initial scan): every card gets the badge. Visually OK; document as expected.
- **Pagination + sort**: every page must apply the sort; `LIMIT/OFFSET` after `ORDER BY`. Confirmed by unit test.

---

## Verification gate

- [ ] All new unit tests pass
- [ ] All new e2e tests pass
- [ ] Full existing vitest suite green
- [ ] Full existing Playwright suite green
- [ ] Codex review on changed files: no HIGH severity findings
- [ ] README documents `NEW_BADGE_DAYS`
- [ ] Visual smoke screenshots attached (default sort, newest sort, badge close-up)
