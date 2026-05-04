# PR-B — Thumbnail dropzone

**Parent:** [feature pack overview](./2026-05-04-skillgoblin-feature-pack-overview.md)
**Branch:** `feat/thumbnail-dropzone`
**Scope:** F2 (drag-and-drop thumbnail upload area in the admin Course Editor)

---

## Goal

Replace the current "Upload image" button in the admin CourseEditor thumbnail
section with a dotted dropzone that accepts both clicks and dropped files.
Same upload pipeline — no server change.

## Non-goals

- No bulk thumbnail import (one course at a time).
- No image cropping or rotation UI — Sharp still resizes server-side to 480x270.
- No drag-drop on the courses page card itself.
- No change to `/api/courses/edit` — same multipart payload.

---

## Approach

Replace the thumbnail block in [CourseEditor.vue](../../../frontend/components/CourseEditor.vue) (lines ~98–134) with a new self-contained area:

```
+------------------------------------------+
| [thumbnail preview at left]              |
|                                          |
|     . . . . . . . . . . . . . . . .      |
|     .                             .      |
|     .  Drop an image here, or     .      |
|     .  click to browse            .      |
|     .                             .      |
|     . . . . . . . . . . . . . . . .      |
|                                          |
|     Recommended size: 480 x 270 px       |
+------------------------------------------+
```

### States

| State | Visual |
|-------|--------|
| Idle | Dashed border, subtle text, no fill |
| Drag-over (file is a valid image) | Solid border, light primary background tint |
| Drag-over (file is not an image) | Red dashed border, "Image files only" message |
| Drop accepted | Preview updates, dropzone returns to idle |
| Drop rejected | Inline error appears below dropzone, auto-clears in 3s |

### Behavior

- Clicking anywhere in the dropzone opens the native file picker (same input
  element, hidden, programmatically focused).
- Dropping a file:
  - One image file → accepted, same handler as the existing `handleThumbnailUpload`.
  - Multiple files → accept first image, ignore rest, show "Only the first image was used" notice.
  - Non-image file → reject with inline error, do not change preview.
  - Folder dropped → reject (use FileSystemEntry detection on `webkitGetAsEntry()` if available; fall back to mime type check).
- File size cap is the existing 10 MB limit enforced by busboy server-side; the
  dropzone shows a soft warning at >10 MB but lets the server reject.
- `aria-label="Upload course thumbnail"`, `role="button"`, `tabindex="0"`,
  Enter and Space trigger the picker. Keep the dropzone keyboard-accessible.
- The existing `thumbnailPreview` and `thumbnailFile` refs are unchanged —
  this is a UI-only refactor that swaps the trigger surface.

### Implementation notes

- All logic stays inside CourseEditor.vue — no new component file required.
  Adds about 60–80 lines of template and script.
- Use the native `dragenter`, `dragover`, `dragleave`, `drop` handlers; track
  drag depth with a counter to avoid the dragleave-fires-on-children issue.
- `e.preventDefault()` on `dragover` so the drop is allowed.
- No external dependency. (No `vue-file-agent`, etc.)

---

## Files changed

### Modified

- `frontend/components/CourseEditor.vue` — replace thumbnail block, add drag handlers, add inline error refs

### Added

- `frontend/tests/e2e/thumbnail-dropzone.spec.js`

No new server files. No schema changes.

---

## Test plan

### Unit tests

None — this is a pure UI behavior change. Coverage lives in e2e where actual
drag events make sense.

### E2E tests (Playwright)

1. As admin, open CourseEditor for an existing course. Verify dropzone is visible and the old "Upload image" button is gone.
2. Click anywhere in the dropzone → file chooser is invoked (use `setInputFiles`).
3. Drop a valid PNG via DataTransfer → preview updates to the dropped image, save the course, verify thumbnail persists.
4. Drop a `.txt` file → inline error appears, preview unchanged.
5. Drop two images at once → first image is used, "Only the first image was used" notice appears.
6. Tab to dropzone, press Enter → file chooser invoked (keyboard accessibility).
7. Drag-over visual state appears when DataTransfer is hovering, disappears on dragleave.

### Manual sign-off

- Visually confirm the dropzone matches the spec on light and dark theme.
- Drop an image from the OS file manager (real drag, not synthetic) on a dev
  build before merging — Playwright's synthetic events miss some real-world quirks.
- Take a screenshot of each visual state for the PR description.

---

## Edge cases

- **Drop on Safari**: Safari's drag events are stricter; verify with Playwright's webkit channel during e2e.
- **Drop on mobile (touch)**: drag-and-drop is not a thing on touch devices — the dropzone collapses to a "Tap to upload" button on viewports < 768px (use the same fallback the rest of the app uses).
- **Paste an image from clipboard**: out of scope for this PR; could be a follow-up.
- **The user drops while a previous upload is in flight**: ignore the drop; show "Upload in progress" notice. Reuse the existing `isSaving` flag.

---

## Verification gate

- [ ] All new e2e tests pass (Chromium, Firefox, Webkit channels)
- [ ] Full existing vitest suite green
- [ ] Full existing Playwright suite green
- [ ] Codex review on changed file: no HIGH severity findings
- [ ] Visual smoke screenshots attached to PR (light + dark, idle + drag-over + error)
- [ ] Real OS drag tested manually on at least one browser
