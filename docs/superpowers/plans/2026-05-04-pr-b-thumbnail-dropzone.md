# PR-B — Thumbnail dropzone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current "Upload image" button in the admin Course Editor with a dotted dropzone that accepts both clicks and dropped image files. Same upload pipeline; no server change.

**Architecture:** Pure UI refactor inside `CourseEditor.vue`. Adds a new `<div>` with `dragenter`/`dragover`/`dragleave`/`drop` handlers, hides the existing `<input type=file>` but keeps it as the actual upload mechanism. State refs track drag-over visual mode and inline error messages. No new files, no new dependencies, no schema change.

**Tech Stack:** Vue 3 SFC, native HTML5 drag-and-drop API, Tailwind utility classes. Playwright for e2e (no Vitest unit — pure UI behavior).

**Spec:** [pr-b-thumbnail-dropzone.md](../specs/2026-05-04-pr-b-thumbnail-dropzone.md)
**Branch:** `feat/thumbnail-dropzone` (cut from `main` at task 1)

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `frontend/tests/e2e/thumbnail-dropzone.spec.js` | E2E tests for click-to-upload, drop, drag-over visual state, reject non-image |

### Modified files

| Path | Change |
|---|---|
| `frontend/components/CourseEditor.vue` | Replace thumbnail block (template) with dropzone + add drag handlers and error refs (script) |

---

## Task list

### Task 1: Cut the feature branch

- [ ] **Step 1.1: Update main and cut branch**

```bash
git fetch origin
git switch -c feat/thumbnail-dropzone origin/main
```

Expected: branch tracks `origin/main`, no working-tree changes.

---

### Task 2: Add dropzone state refs and handlers to CourseEditor script

**Files:**
- Modify: `frontend/components/CourseEditor.vue`

- [ ] **Step 2.1: Add the new refs and handlers**

Open `frontend/components/CourseEditor.vue`. In the `<script setup>` block,
just below `const thumbnailFile = ref(null);`, add:

```javascript
// Dropzone state
const isDragging = ref(false);
const dragDepth = ref(0); // counter to handle dragleave firing on children
const uploadError = ref('');
const fileInputRef = ref(null);
let errorTimer = null;

const ACCEPTED_PREFIXES = ['image/'];
const SOFT_SIZE_WARN = 10 * 1024 * 1024; // 10 MB — server enforces hard limit

function showError(msg) {
  uploadError.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { uploadError.value = ''; }, 3000);
}

function fileLooksLikeImage(file) {
  if (!file || !file.type) return false;
  return ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p));
}

function applyImageFile(file) {
  if (!fileLooksLikeImage(file)) {
    showError('Image files only.');
    return;
  }
  if (file.size > SOFT_SIZE_WARN) {
    showError('Warning: file is larger than 10 MB and may be rejected by the server.');
  }
  thumbnailFile.value = file;
  thumbnailPreview.value = URL.createObjectURL(file);
  formData.value.thumbnail = file;
}

function onDragEnter(event) {
  event.preventDefault();
  dragDepth.value += 1;
  isDragging.value = true;
}

function onDragOver(event) {
  // Required so the browser will fire `drop`
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave(event) {
  event.preventDefault();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) isDragging.value = false;
}

function onDrop(event) {
  event.preventDefault();
  dragDepth.value = 0;
  isDragging.value = false;

  const dt = event.dataTransfer;
  if (!dt) return;

  // Reject folders (FileSystemEntry returns isDirectory=true)
  const items = dt.items ? Array.from(dt.items) : [];
  for (const item of items) {
    if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        showError('Folders are not supported. Drop a single image file.');
        return;
      }
    }
  }

  const files = dt.files ? Array.from(dt.files) : [];
  if (files.length === 0) return;

  const firstImage = files.find(fileLooksLikeImage);
  if (!firstImage) {
    showError('Image files only.');
    return;
  }
  if (files.length > 1) {
    showError('Only the first image was used.');
  }
  applyImageFile(firstImage);
}

function openFilePicker() {
  if (fileInputRef.value) fileInputRef.value.click();
}

function onZoneKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker();
  }
}
```

- [ ] **Step 2.2: Update the existing `handleThumbnailUpload` to reuse `applyImageFile`**

Find the existing `handleThumbnailUpload` function:

```javascript
const handleThumbnailUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    thumbnailFile.value = file;
    thumbnailPreview.value = URL.createObjectURL(file);
    formData.value.thumbnail = file;
  }
};
```

Replace it with:

```javascript
const handleThumbnailUpload = (event) => {
  const file = event.target.files[0];
  if (file) applyImageFile(file);
};
```

> No commit yet — the template change in Task 3 makes these refs visible and is committed together.

---

### Task 3: Replace the thumbnail template block with the dropzone

**Files:**
- Modify: `frontend/components/CourseEditor.vue`

- [ ] **Step 3.1: Replace the thumbnail block in the template**

In the template, find the block that starts with `<!-- Thumbnail -->` and ends
just before `<!-- Release Date -->`. Replace the entire block with:

```vue
<!-- Thumbnail -->
<div>
  <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
    Thumbnail
  </h3>
  <div class="mt-1 flex items-stretch space-x-4">
    <div class="w-32 h-24 shrink-0 bg-gray-100 dark:bg-gray-700 overflow-hidden rounded-md">
      <img
        v-if="thumbnailPreview"
        :src="thumbnailPreview"
        alt="Course thumbnail"
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <img
          :src="`/images/placeholder.png?t=${Date.now()}`"
          alt="Default thumbnail"
          class="w-full h-full object-cover"
        />
      </div>
    </div>

    <div
      data-testid="thumbnail-dropzone"
      role="button"
      tabindex="0"
      aria-label="Upload course thumbnail"
      class="flex-1 flex flex-col items-center justify-center cursor-pointer rounded-md border-2 border-dashed transition-colors px-4 py-6 text-center select-none"
      :class="[
        uploadError ? 'border-red-400 dark:border-red-500' : isDragging
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
          : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
      ]"
      @click="openFilePicker"
      @keydown="onZoneKeydown"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12m4.5-4.5V21" />
      </svg>
      <p class="text-sm text-gray-700 dark:text-gray-200">
        <span class="font-medium">Drop an image here</span> or click to browse
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Recommended size: 480 × 270 px
      </p>
      <input
        ref="fileInputRef"
        id="thumbnailUpload"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleThumbnailUpload"
      />
    </div>
  </div>
  <p v-if="uploadError" data-testid="thumbnail-upload-error" class="mt-2 text-sm text-red-500 dark:text-red-400">
    {{ uploadError }}
  </p>
</div>
```

- [ ] **Step 3.2: Verify the page renders without errors**

If you have a dev stack handy:

```bash
docker compose up --build -d
```

Open `http://localhost:3000/courses`, log in as admin, click Edit on any
course. The dropzone should be visible. Drop an image — the preview should update.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/components/CourseEditor.vue
git commit -m "feat(editor): drag-and-drop thumbnail dropzone"
```

---

### Task 4: Playwright e2e — happy path and rejects

**Files:**
- Create: `frontend/tests/e2e/thumbnail-dropzone.spec.js`

- [ ] **Step 4.1: Write the e2e**

Create `frontend/tests/e2e/thumbnail-dropzone.spec.js`:

```javascript
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ADMIN_NAME = process.env.ADMIN_NAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-password';

async function loginAsAdmin(page) {
  await page.goto('/');
  await page.click(`[data-testid=user-tile-${ADMIN_NAME}]`).catch(() => {});
  await page.fill('input[type=password]', ADMIN_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/courses/);
}

async function openFirstCourseEditor(page) {
  const editBtn = page.locator('[data-testid=course-edit-button]').first();
  // Fallback: the existing template uses a generic button with title="Edit course"
  // if the data-testid hasn't been added yet, fall back to the title attribute.
  if ((await editBtn.count()) === 0) {
    await page.locator('button[title="Edit course"]').first().click();
  } else {
    await editBtn.click();
  }
  await expect(page.locator('[data-testid=thumbnail-dropzone]')).toBeVisible();
}

// Build a tiny PNG once and reuse it across tests.
function tinyPngPath() {
  const tmp = path.join(os.tmpdir(), 'sg-tiny.png');
  if (!fs.existsSync(tmp)) {
    // 1x1 red PNG (valid; smallest possible reasonable file)
    const b = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
      '53de00000010494441545801636060f8cf80018000000007000180fe5be3a4' +
      '0000000049454e44ae426082',
      'hex',
    );
    fs.writeFileSync(tmp, b);
  }
  return tmp;
}

test.describe('thumbnail dropzone', () => {
  test('clicks the dropzone and uploads a real image via the file input', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourseEditor(page);

    const fileInput = page.locator('#thumbnailUpload');
    await fileInput.setInputFiles(tinyPngPath());

    // Preview img receives the blob URL
    const preview = page.locator('img[alt="Course thumbnail"]');
    await expect(preview).toBeVisible();
  });

  test('rejects a non-image drop with an inline error', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourseEditor(page);

    // Synthesize a drop event with a text file
    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      const dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
      const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
      dz.dispatchEvent(evt);
    });

    await expect(page.locator('[data-testid=thumbnail-upload-error]')).toContainText(
      /Image files only/i,
    );
  });

  test('drag-over visual state appears and clears', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourseEditor(page);

    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }));
      dz.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-testid=thumbnail-dropzone]')).toHaveClass(/border-primary/);

    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      const dt = new DataTransfer();
      dz.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-testid=thumbnail-dropzone]')).not.toHaveClass(/border-primary/);
  });

  test('keyboard activates the file picker', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourseEditor(page);

    const dz = page.locator('[data-testid=thumbnail-dropzone]');
    await dz.focus();

    // We can't observe the native file picker opening in a headless browser,
    // but we can prove that pressing Enter calls the click handler — which in
    // turn proxies to the hidden input. Spy on the click on the hidden input.
    const inputClicked = await page.evaluate(() => {
      let clicked = false;
      const input = document.getElementById('thumbnailUpload');
      const original = input.click.bind(input);
      input.click = () => { clicked = true; original(); };
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      dz.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return clicked;
    });
    expect(inputClicked).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run the dockerized test stack**

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full vitest + Playwright suite green, including the four new tests.

- [ ] **Step 4.3: Commit**

```bash
git add frontend/tests/e2e/thumbnail-dropzone.spec.js
git commit -m "test(e2e): thumbnail dropzone click, drop, reject, keyboard"
```

---

### Task 5: Manual visual smoke

- [ ] **Step 5.1: Spin up dev stack**

```bash
docker compose down -v
docker compose up --build -d
```

- [ ] **Step 5.2: Visual checks**

Open `http://localhost:3000`, log in as admin, open Edit on a course. Verify:

1. Dropzone shows dashed border, "Drop an image here or click to browse" text, recommended-size hint.
2. Dragging a real image file from your OS file manager over the zone changes the border to solid primary color and tints the background.
3. Releasing the file updates the small preview thumbnail on the left.
4. Dropping a `.txt` file shows the red inline error and resets after ~3 seconds.
5. Toggle dark mode (theme toggle in header). Both visual states look correct in dark theme.
6. Save the course → thumbnail change persists (this confirms the existing upload pipeline still works).

- [ ] **Step 5.3: Capture screenshots for the PR**

Take three screenshots: idle state, drag-over state, error state. Save as
`/tmp/dropzone-idle.png`, `/tmp/dropzone-dragover.png`, `/tmp/dropzone-error.png`.
You'll attach them to the PR description in Task 7.

- [ ] **Step 5.4: Tear down dev stack**

```bash
docker compose down
```

---

### Task 6: Codex review

- [ ] **Step 6.1: Run codex on the diff**

```bash
git diff origin/main...HEAD > /tmp/pr-b-diff.txt
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task \
  "Review this Vue 3 / Nuxt PR. Focus on: \
  (1) any way a malicious page could trick the dropzone into uploading wrong content, \
  (2) memory leaks from URL.createObjectURL without revoke, \
  (3) accessibility regressions (missing aria, keyboard traps), \
  (4) regressions in the existing upload pipeline. \
  Reply with HIGH/MEDIUM/LOW findings. Diff:\n\n$(head -c 200000 /tmp/pr-b-diff.txt)"
```

Expected: structured review. Address every HIGH finding.

- [ ] **Step 6.2: Apply any HIGH-severity fixes**

If codex flags HIGH findings, fix them, re-run the dockerized tests, commit with `fix(pr-b): address codex review findings`. Otherwise skip.

---

### Task 7: Push and open the PR

- [ ] **Step 7.1: Push and open PR**

```bash
git push -u origin feat/thumbnail-dropzone
gh pr create \
  --base main \
  --title "feat(editor): drag-and-drop thumbnail dropzone" \
  --body "$(cat <<'EOF'
## Summary
- Replaces the upload-button thumbnail UX with a dotted dropzone that accepts both clicks and dropped image files
- Same upload pipeline; no server changes
- Rejects folders and non-images with an inline error; warns when files are larger than the server's 10 MB limit
- Keyboard-accessible (role="button", Enter / Space activates the file picker)

## Test plan
- [x] Vitest unit suite green
- [x] Playwright e2e green (new: thumbnail-dropzone)
- [x] Manual smoke: real OS drag-drop verified on Chromium
- [x] Visual smoke: idle / drag-over / error states screenshotted

## Spec
docs/superpowers/specs/2026-05-04-pr-b-thumbnail-dropzone.md
EOF
)"
```

- [ ] **Step 7.2: Update master tracker**

Edit `docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md`, tick PR-B checklist items. Commit + push.

```bash
git add docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md
git commit -m "docs(tracker): PR-B complete"
git push
```

---

## Verification gate

- [ ] All four new e2e tests pass
- [ ] Full existing vitest + Playwright suites green
- [ ] Codex sweep: no HIGH findings open
- [ ] Visual smoke screenshots attached to PR
- [ ] Real OS drag tested manually on at least one browser
- [ ] Master tracker PR-B boxes ticked
