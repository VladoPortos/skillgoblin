# PR-A — Content folder as source of truth

**Parent:** [feature pack overview](./2026-05-04-skillgoblin-feature-pack-overview.md)
**Branch:** `feat/content-source-of-truth`
**Scope:** F1 (`course.json` override + admin export) and F3 server side (`.srt` sidecar serving)

---

## Goal

Make the course folder authoritative for text metadata, so that:

1. An operator can drop a `course.json` next to `thumbnail.png` and have its
   values override the auto-detected title/description/category/releaseDate.
2. An admin can press a button to export the current DB metadata for one course
   (or all courses) into `course.json` files, producing a portable backup that
   travels with the folder.
3. A `lesson1.srt` next to `lesson1.mp4` is detected and served via the existing
   `/api/content/...` route so the player can attach it as a `<track>`. The
   user-facing CC toggle is in PR-C.

## Non-goals

- No new auth, no new tables, no migration.
- `course.json` does not own the thumbnail (`thumbnail.png` convention stays).
- Per-video subtitle toggling is out of scope (PR-C handles a global CC toggle).
- No automatic JSON write-back when an admin edits a course — export is explicit.

---

## Approach

### F1.a — `course.json` override at scan time

Existing scan flow:

- [`courseGenerator.generateCourseJson(courseDir, coursePath)`](../../../frontend/server/utils/courseGenerator.js) builds metadata from folder name only.
- [`courseWatcher.processCourseDirectory`](../../../frontend/server/utils/courseWatcher.js) and [`processCourseDirWithMetadataPreservation`](../../../frontend/server/utils/courseWatcher.js) feed that to the DB.

Change: after `generateCourseJson` produces the auto-detected object, attempt to
read `<coursePath>/course.json`. If it parses and is valid, shallow-merge its
allowed fields over the auto-detected object before any DB write.

**Allowed fields in `course.json`:**

```json
{
  "title": "string",
  "description": "string",
  "category": "string",
  "releaseDate": "YYYY-MM-DD"
}
```

**Disallowed (silently ignored, with a console warning):**

- `id` — derived from folder name; never overrideable.
- `folder_name` — derived from folder name.
- `thumbnail` — file convention only.
- `lessons` — derived from folder structure.
- Any unknown key.

**Validation:**

- Each field is optional. Missing fields fall back to auto-detected.
- Each field's type must match the schema; type mismatch → log warning, ignore that field, continue with other valid fields.
- File parse error → log warning, fall back to auto-detected entirely (don't crash the scan).
- File missing → no warning, behave exactly as today.

**Precedence in metadata-preservation rescan:** Today, the
"Preserve metadata" rescan keeps DB values over freshly-scanned values. New
order:

1. Auto-detected from folder structure (baseline)
2. `course.json` if present (override)
3. DB values via `preserveMetadata` flag (only when JSON is absent)

This means **`course.json` beats DB**, so an admin who edits in the modal and
re-rescans-with-preserve will see the JSON win. The CourseEditor will warn the
admin in PR-A's UI work (see below).

### F1.b — Admin "Export to JSON"

Two new endpoints, both `requireAdmin`:

- `POST /api/courses/:id/export-json` — writes `course.json` into that one
  course's folder.
- `POST /api/courses/export-json-all` — iterates every course in the DB, writes
  `course.json` into each folder. Returns `{ success, written: number, failed: [{id, reason}] }`.

The export reads from the `courses` table (title, description, category,
release_date), serializes the four allowed fields, and writes the file with
`utf-8` encoding and 2-space indentation.

If the target file already exists, **overwrite without prompting** — this is an
admin tool and the user explicitly asked for it. Document in the spec and admin
UI copy.

### F1.c — AdminPanel UI

Add a "Course Metadata" section under a new tab `Content` in [AdminPanel.vue](../../../frontend/components/AdminPanel.vue):

- Button: "Export JSON for all courses" — triggers `export-json-all`, shows
  success/failure summary inline.
- (Per-course export lives in the existing CourseEditor footer, not in
  AdminPanel — admins already have an Edit button per course on the courses
  page.)

In [CourseEditor.vue](../../../frontend/components/CourseEditor.vue):

- Add a small "Export to course.json" link/button in the footer near Save.
- When the editor opens for a course whose folder has a `course.json`, show a
  yellow banner: *"This course has a `course.json` override. Edits saved here
  will be reverted on the next rescan unless you re-export."*

The presence-of-JSON check uses a new lightweight endpoint:
`GET /api/courses/:id/has-json` → `{ hasJson: boolean }`. Avoids loading
the JSON contents when we only need a boolean.

### F3.a (server) — `.srt` sidecar serving

Today the file scanner excludes `.srt` from the file-listing modal but `.srt`
files are served by the same `/api/content/...` route as videos (Nitro public
routing). Verify this and add a unit test confirming `.srt` is served with
`text/plain; charset=utf-8` (the default `text/vtt` would be wrong for SRT —
browsers accept SRT in `<track>` if the subtitle file extension is `.vtt`, but
not always for `.srt`).

**Real plan:** Convert SRT to VTT on the fly. Add a new endpoint
`GET /api/content/:courseId/<...path>/<name>.vtt` that:

1. Looks for a sibling `.srt` file with the same basename if the `.vtt` doesn't exist.
2. If found, reads it, runs an in-memory SRT→VTT conversion (just prepend
   `WEBVTT\n\n` and replace `,` with `.` in timestamps), and returns it.
3. Sets `Content-Type: text/vtt`.
4. Caches result in memory keyed by file mtime + path (LRU, max 64 entries).

This makes the existing `<track src="...vtt">` markup just work without any
server-side file conversion or new dependencies.

### F3.b (server-only) — Track URL exposed in course payload

The `/api/courses/:id` response currently returns `lessons[].videos[].file` as a
plain filename. Add an optional `subtitle` field to each video:

```js
{ title: "Intro", file: "01-intro.mp4", subtitle: "01-intro.srt" }
```

Populated only if the `.srt` sidecar exists at scan time. The actual `<track>`
URL the client requests is the same path with `.vtt` extension, hitting the
new conversion endpoint. The client computes that URL — server only flags
"yes, a subtitle is available."

PR-C uses `currentVideo.subtitle` to decide whether to render `<track>` and the
CC button.

---

## Files changed

### Modified

- `frontend/server/utils/courseGenerator.js` — add `course.json` merge step
- `frontend/server/utils/courseWatcher.js` — pass through merged data to DB
- `frontend/server/utils/fileScanner.js` — keep `course.json` in the excluded list (already there)
- `frontend/server/api/courses/[id].js` — augment payload with `subtitle` field where sidecar exists
- `frontend/components/AdminPanel.vue` — new "Content" tab, "Export all to JSON" button
- `frontend/components/CourseEditor.vue` — `course.json` banner + export-this-course button
- `README.md` — document `course.json` schema and export feature

### Added

- `frontend/server/api/courses/[id]/export-json.post.js`
- `frontend/server/api/courses/export-json-all.post.js`
- `frontend/server/api/courses/[id]/has-json.get.js`
- `frontend/server/api/content/[...path].vtt.get.js` — SRT→VTT conversion endpoint
- `frontend/server/utils/courseJsonOverride.js` — pure function: `applyCourseJsonOverride(coursePath, autoDetected) → merged`
- `frontend/server/utils/srtToVtt.js` — pure function with LRU cache
- `frontend/tests/unit/courseJsonOverride.test.js`
- `frontend/tests/unit/srtToVtt.test.js`
- `frontend/tests/e2e/admin-content-export.spec.js`

---

## Test plan

### Unit tests

1. `applyCourseJsonOverride` — missing file returns the auto-detected object unchanged.
2. `applyCourseJsonOverride` — valid file with `title` and `description` produces a merged object with those overrides.
3. `applyCourseJsonOverride` — file with disallowed `id` field logs warning, preserves auto-detected `id`.
4. `applyCourseJsonOverride` — malformed JSON returns auto-detected object, logs warning.
5. `applyCourseJsonOverride` — type mismatch on `releaseDate` (number not string) ignored, other valid fields applied.
6. `srtToVtt` — basic two-cue file converts correctly with `WEBVTT` header and `.` instead of `,` in timestamps.
7. `srtToVtt` — empty file returns `WEBVTT\n\n`.
8. `srtToVtt` — LRU cache returns same buffer for repeated identical input.

### E2E tests (Playwright)

1. As admin, navigate to AdminPanel → Content → click "Export all to JSON". Verify success notice and that one expected file appears in the test fixture course folder.
2. As admin, edit a course in CourseEditor. Verify the "course.json" banner is hidden when no JSON exists, then create a JSON via export, reopen editor, banner appears.
3. As admin, edit a course's title in CourseEditor → save. Trigger rescan with "Preserve metadata". Verify DB title is overwritten by `course.json` value (not the admin edit). Document this in the user-facing copy.
4. With a `.srt` fixture sidecar, verify the course payload from `/api/courses/:id` includes `subtitle` field on the matching video.
5. With a `.srt` fixture sidecar, fetch `<...>.vtt` URL → returns a VTT file with proper header.

### Manual sign-off

- Visit AdminPanel → Content tab → click Export all → check `data/content/<course>/course.json` files exist with the expected JSON shape.
- Edit a JSON file by hand, change title to something distinctive, trigger rescan with "Preserve metadata", verify the courses page shows the new title.
- Confirm Playwright run captures a screenshot of the AdminPanel Content tab and the CourseEditor banner state.

---

## Edge cases

- **Empty `course.json`** (`{}`): treated as no overrides; no warning.
- **`course.json` with extra whitespace / BOM**: stripped before parse.
- **Folder is read-only at export time**: surface error in admin UI, continue with other courses, list failed ones.
- **Course folder deleted between admin click and export run**: skip with a warning in the failed list.
- **Existing `course.json` is malformed** at scan time: scan continues with auto-detected metadata; error appears in server log only (not user-facing).
- **`.srt` is BOM-prefixed UTF-16**: convert to UTF-8 before VTT conversion. Add a regression test if practical.

---

## Verification gate

- [ ] All new unit tests pass
- [ ] All new e2e tests pass
- [ ] Full existing vitest suite green
- [ ] Full existing Playwright suite green
- [ ] Codex review on changed files: no HIGH severity findings
- [ ] Manual visual smoke recorded in PR description
- [ ] README updated with `course.json` schema and export usage
