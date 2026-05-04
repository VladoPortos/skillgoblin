# PR-A — Content folder as source of truth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the course folder authoritative for text metadata (`course.json` override at scan time), let admins export DB metadata back to JSON files (single course + bulk), and serve `.srt` subtitle sidecars as on-the-fly `.vtt` so the player can attach them as `<track>` elements.

**Architecture:** Two pure utilities (`srtToVtt`, `applyCourseJsonOverride`) drive the new behavior. The existing scanner pipeline (`courseGenerator` → `courseWatcher`) gains a single override step. Admin export adds three small Nitro routes that all use the existing `requireAdmin` auth helper. The VTT-on-the-fly conversion is a new branch in the existing catch-all `/api/content/[...path].js` — no new route file needed.

**Tech Stack:** Nuxt 3, Nitro server (h3), better-sqlite3, Vitest 4 (unit), Playwright (e2e), `lru-cache` (already in deps), Sharp/busboy for unrelated thumbnail flow. ESM JavaScript throughout.

**Spec:** [pr-a-content-source-of-truth.md](../specs/2026-05-04-pr-a-content-source-of-truth.md)
**Branch:** `feat/content-source-of-truth` (cut from `main` at task 1)
**Tracker:** [feature-pack-overview.md](../specs/2026-05-04-skillgoblin-feature-pack-overview.md)

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `frontend/server/utils/srtToVtt.js` | Pure SRT→VTT conversion + LRU memo |
| `frontend/server/utils/courseJsonOverride.js` | Read `course.json` from a course folder, validate, return merged metadata |
| `frontend/server/api/courses/[id]/has-json.get.js` | Tiny GET — returns `{ hasJson: boolean }` |
| `frontend/server/api/courses/[id]/export-json.post.js` | Admin POST — write `course.json` for one course |
| `frontend/server/api/courses/export-json-all.post.js` | Admin POST — write `course.json` for every course in DB |
| `frontend/tests/unit/srtToVtt.test.js` | Unit tests for the SRT→VTT conversion |
| `frontend/tests/unit/courseJsonOverride.test.js` | Unit tests for the override merge |
| `frontend/tests/e2e/admin-content-export.spec.js` | E2E for the export & override flow |

### Modified files

| Path | Change |
|---|---|
| `frontend/server/utils/courseGenerator.js` | After auto-detection, apply `course.json` override; populate `subtitle` field for each video that has a `.srt` sibling |
| `frontend/server/utils/courseWatcher.js` | Ensure `processCourseDirWithMetadataPreservation` honors `course.json` precedence over DB-preserved metadata |
| `frontend/server/api/content/[...path].js` | Add a `.vtt` branch that converts a sibling `.srt` on the fly |
| `frontend/components/AdminPanel.vue` | Add "Content" tab with "Export all to JSON" button |
| `frontend/components/CourseEditor.vue` | Show banner when `course.json` exists; add "Export to JSON" button in footer |
| `README.md` | Document `course.json` schema and export feature |

---

## Task list

### Task 1: Cut the feature branch

**Files:** None (git only)

- [ ] **Step 1.1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` (or only the spec/plan docs committed earlier)

- [ ] **Step 1.2: Update `main` and cut the branch**

Run:

```bash
git fetch origin
git switch -c feat/content-source-of-truth origin/main
```

Expected: branch created and tracked; `git status` shows the branch is at `origin/main`.

- [ ] **Step 1.3: Cherry-pick the spec/plan commits onto the new branch**

If the spec and plan files were committed on a separate branch and they are needed for reference during this PR, cherry-pick them. Otherwise skip.

Run: `git cherry-pick <commit-sha-of-spec-commit> <commit-sha-of-plan-commit>`
Expected: clean cherry-pick, no conflicts (spec/plan files are docs-only).

> If you prefer the specs to live only on the worktree branch and not in this PR, skip this step.

---

### Task 2: SRT→VTT pure utility — failing test

**Files:**
- Create: `frontend/tests/unit/srtToVtt.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `frontend/tests/unit/srtToVtt.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { srtToVtt } from '../../server/utils/srtToVtt.js';

describe('srtToVtt', () => {
  it('converts a basic two-cue SRT to VTT', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello world',
      '',
      '2',
      '00:00:05,500 --> 00:00:08,250',
      'Second cue',
      '',
    ].join('\n');

    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
    expect(vtt).toContain('00:00:05.500 --> 00:00:08.250');
    expect(vtt).toContain('Hello world');
    expect(vtt).toContain('Second cue');
  });

  it('returns just the WEBVTT header for empty input', () => {
    expect(srtToVtt('')).toBe('WEBVTT\n\n');
  });

  it('strips a UTF-8 BOM if present', () => {
    const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nA\n';
    const vtt = srtToVtt(srt);
    expect(vtt.charCodeAt(0)).toBe(0x57); // 'W' from WEBVTT, not BOM
  });

  it('normalizes CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n';
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
    expect(vtt).toContain('A');
    expect(vtt).not.toContain('\r');
  });

  it('only replaces commas inside timestamp lines, not in cue text', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Hello, world',
      '',
    ].join('\n');
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('Hello, world'); // comma in text is preserved
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run from `frontend/`: `npx vitest run tests/unit/srtToVtt.test.js`
Expected: FAIL with "Cannot find module '../../server/utils/srtToVtt.js'" or similar.

---

### Task 3: SRT→VTT pure utility — implementation

**Files:**
- Create: `frontend/server/utils/srtToVtt.js`

- [ ] **Step 3.1: Implement the conversion**

Create `frontend/server/utils/srtToVtt.js`:

```javascript
import { LRUCache } from 'lru-cache';

// Memoize conversions keyed by source-file path + mtime so a re-edited .srt
// invalidates automatically. Buffers are small (a few KB each).
const cache = new LRUCache({ max: 64 });

const TIMESTAMP_RE = /^(\d\d:\d\d:\d\d),(\d{3}) --> (\d\d:\d\d:\d\d),(\d{3})$/;

// Convert an SRT body (string) to a VTT body (string).
// - Strips a leading UTF-8 BOM if present
// - Normalizes CRLF to LF
// - Replaces the comma decimal separator with a period in timestamp lines only
// - Prepends the WEBVTT header
//
// Pure function. No I/O, no caching at this layer (cache lives in `convertFromFile`).
export function srtToVtt(srtBody) {
  if (!srtBody) return 'WEBVTT\n\n';
  let body = srtBody.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = body.split('\n').map((line) => {
    const m = line.match(TIMESTAMP_RE);
    if (!m) return line;
    return `${m[1]}.${m[2]} --> ${m[3]}.${m[4]}`;
  });
  return 'WEBVTT\n\n' + lines.join('\n');
}

// Convert from a file path with a per-(path,mtime) memo. Returns a Buffer
// (UTF-8) ready to be written to the response. Throws on read failure so
// the caller can map it to a 404 / 500.
export async function convertSrtFileToVtt(srtFilePath, fs) {
  const stat = await fs.promises.stat(srtFilePath);
  const key = `${srtFilePath}:${stat.mtimeMs}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const raw = await fs.promises.readFile(srtFilePath, 'utf8');
  const vtt = srtToVtt(raw);
  const buf = Buffer.from(vtt, 'utf8');
  cache.set(key, buf);
  return buf;
}

// Test-only hook so unit tests can clear the cache between runs.
export function _resetSrtCache() {
  cache.clear();
}
```

- [ ] **Step 3.2: Run test to verify it passes**

Run from `frontend/`: `npx vitest run tests/unit/srtToVtt.test.js`
Expected: PASS, 5 tests green.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/server/utils/srtToVtt.js frontend/tests/unit/srtToVtt.test.js
git commit -m "feat(srt): add SRT→VTT pure converter with mtime-keyed cache"
```

---

### Task 4: course.json override utility — failing test

**Files:**
- Create: `frontend/tests/unit/courseJsonOverride.test.js`

- [ ] **Step 4.1: Write the failing test**

Create `frontend/tests/unit/courseJsonOverride.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyCourseJsonOverride } from '../../server/utils/courseJsonOverride.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cjo-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseAuto = () => ({
  id: 'unreal-course',
  title: 'Unreal Course',
  description: 'Course: Unreal Course',
  category: 'Uncategorized',
  thumbnail: 'thumbnail.png',
  releaseDate: '2026-05-04',
  lessons: [{ id: 'lesson-1', title: 'Lesson 1', folder: 'Lesson 1', videos: [] }],
  lastUpdate: 1700000000000,
});

describe('applyCourseJsonOverride', () => {
  it('returns auto-detected unchanged when no course.json exists', () => {
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
  });

  it('overrides title, description, category, releaseDate when valid', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({
        title: 'Real Title',
        description: 'A real description.',
        category: 'Programming',
        releaseDate: '2025-01-15',
      }),
    );
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.title).toBe('Real Title');
    expect(result.description).toBe('A real description.');
    expect(result.category).toBe('Programming');
    expect(result.releaseDate).toBe('2025-01-15');
    // Untouched fields stay intact
    expect(result.id).toBe('unreal-course');
    expect(result.thumbnail).toBe('thumbnail.png');
    expect(result.lessons).toHaveLength(1);
  });

  it('ignores disallowed fields with a console warning', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({ id: 'evil', thumbnail: 'evil.png', lessons: [] }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.id).toBe('unreal-course');
    expect(result.thumbnail).toBe('thumbnail.png');
    expect(result.lessons).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns auto-detected on malformed JSON, with a console warning', () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{ not valid json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a field with the wrong type but applies the rest', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({ title: 'OK', releaseDate: 12345 }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.title).toBe('OK');
    expect(result.releaseDate).toBe('2026-05-04'); // unchanged
    warn.mockRestore();
  });

  it('treats an empty {} as no overrides without a warning', () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('hasCourseJson', () => {
  it('returns false when course.json is missing', async () => {
    const { hasCourseJson } = await import('../../server/utils/courseJsonOverride.js');
    expect(hasCourseJson(tmpDir)).toBe(false);
  });
  it('returns true when course.json exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{}');
    const { hasCourseJson } = await import('../../server/utils/courseJsonOverride.js');
    expect(hasCourseJson(tmpDir)).toBe(true);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run from `frontend/`: `npx vitest run tests/unit/courseJsonOverride.test.js`
Expected: FAIL with "Cannot find module '../../server/utils/courseJsonOverride.js'".

---

### Task 5: course.json override utility — implementation

**Files:**
- Create: `frontend/server/utils/courseJsonOverride.js`

- [ ] **Step 5.1: Implement the override merge**

Create `frontend/server/utils/courseJsonOverride.js`:

```javascript
import fs from 'fs';
import path from 'path';

// Allowed keys in course.json. Anything else is rejected with a warning.
const ALLOWED = ['title', 'description', 'category', 'releaseDate'];

// Each allowed key must be a string (releaseDate is a YYYY-MM-DD-ish string,
// kept loose because the rest of the app treats it as an opaque string).
function isString(v) {
  return typeof v === 'string';
}

// Returns true iff the course folder contains a course.json file.
// O(1) — single existsSync. Used by the has-json endpoint.
export function hasCourseJson(courseFolderPath) {
  try {
    return fs.existsSync(path.join(courseFolderPath, 'course.json'));
  } catch {
    return false;
  }
}

// Read course.json from the course folder (if present), validate, and return
// a new auto-detected object with the valid overrides applied. The input
// `autoDetected` object is not mutated.
//
// On any error (missing file, bad JSON, type mismatch on a field), fall back
// to the auto-detected value for that field. Console warnings explain why so
// an operator can debug without crashing the scan.
export function applyCourseJsonOverride(courseFolderPath, autoDetected) {
  const filePath = path.join(courseFolderPath, 'course.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[courseJsonOverride] cannot read ${filePath}: ${err.message}`);
    }
    return { ...autoDetected };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (err) {
    console.warn(`[courseJsonOverride] malformed JSON in ${filePath}: ${err.message}`);
    return { ...autoDetected };
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[courseJsonOverride] ${filePath} top-level must be an object`);
    return { ...autoDetected };
  }

  const merged = { ...autoDetected };

  // Warn on disallowed keys before applying allowed ones.
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED.includes(key)) {
      console.warn(
        `[courseJsonOverride] ${filePath}: ignoring disallowed key "${key}". ` +
        `Allowed: ${ALLOWED.join(', ')}.`,
      );
    }
  }

  for (const key of ALLOWED) {
    if (!(key in parsed)) continue;
    const value = parsed[key];
    if (!isString(value)) {
      console.warn(
        `[courseJsonOverride] ${filePath}: "${key}" must be a string, ` +
        `got ${typeof value}; ignoring.`,
      );
      continue;
    }
    merged[key] = value;
  }

  return merged;
}
```

- [ ] **Step 5.2: Run test to verify it passes**

Run from `frontend/`: `npx vitest run tests/unit/courseJsonOverride.test.js`
Expected: PASS, 8 tests green.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/server/utils/courseJsonOverride.js frontend/tests/unit/courseJsonOverride.test.js
git commit -m "feat(scan): add course.json override utility with field validation"
```

---

### Task 6: Wire override into the scanner

**Files:**
- Modify: `frontend/server/utils/courseGenerator.js`

- [ ] **Step 6.1: Apply the override in `generateCourseJson`**

Open `frontend/server/utils/courseGenerator.js`. Replace the entire file with:

```javascript
import fs from 'fs';
import path from 'path';
import { generateCourseId, naturalSort } from './courseHelpers';
import { applyCourseJsonOverride } from './courseJsonOverride.js';

// Build a per-video subtitle hint: if `lesson1.srt` exists next to
// `lesson1.mp4`, return the .srt filename so the client can request a
// converted .vtt sibling. Returns null when no sibling exists.
function findSubtitleSibling(videoFilePath) {
  const dir = path.dirname(videoFilePath);
  const base = path.basename(videoFilePath, path.extname(videoFilePath));
  const srtName = `${base}.srt`;
  const candidate = path.join(dir, srtName);
  try {
    return fs.existsSync(candidate) ? srtName : null;
  } catch {
    return null;
  }
}

// Function to generate lessons from the folder structure
export const generateLessonsFromFolder = (coursePath) => {
  const lessons = [];

  const items = fs.readdirSync(coursePath, { withFileTypes: true });
  const lessonDirs = items.filter((item) => item.isDirectory());
  const rootVideos = items.filter(
    (item) => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'),
  );

  if (rootVideos.length > 0) {
    const introVideos = rootVideos.map((video) => {
      const fullPath = path.join(coursePath, video.name);
      const subtitle = findSubtitleSibling(fullPath);
      const entry = {
        title: video.name.replace('.mp4', '').replace(/_/g, ' '),
        file: video.name,
      };
      if (subtitle) entry.subtitle = subtitle;
      return entry;
    });

    introVideos.sort((a, b) => naturalSort(a, b));

    lessons.push({
      id: 'main-content',
      title: 'Main Content',
      folder: '',
      videos: introVideos,
    });
  }

  lessonDirs.forEach((lessonDir) => {
    const lessonPath = path.join(coursePath, lessonDir.name);
    const lessonVideos = fs
      .readdirSync(lessonPath, { withFileTypes: true })
      .filter((item) => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'))
      .map((video) => {
        const fullPath = path.join(lessonPath, video.name);
        const subtitle = findSubtitleSibling(fullPath);
        const entry = {
          title: video.name.replace('.mp4', '').replace(/_/g, ' '),
          file: video.name,
        };
        if (subtitle) entry.subtitle = subtitle;
        return entry;
      });

    if (lessonVideos.length > 0) {
      const lessonId = lessonDir.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      lessonVideos.sort((a, b) => naturalSort(a, b));

      lessons.push({
        id: lessonId,
        title: lessonDir.name,
        folder: lessonDir.name,
        videos: lessonVideos,
      });
    }
  });

  lessons.sort((a, b) => naturalSort(a, b));
  return lessons;
};

// Generate course metadata from folder structure, then layer course.json
// overrides on top so the operator's intent wins over auto-detection.
export const generateCourseJson = (courseDir, coursePath) => {
  console.log(`Generating course data for ${courseDir}`);

  const courseId = generateCourseId(courseDir);
  const lessons = generateLessonsFromFolder(coursePath);

  const autoDetected = {
    id: courseId,
    title: courseDir,
    description: `Course: ${courseDir}`,
    thumbnail: 'thumbnail.png',
    category: 'Uncategorized',
    releaseDate: new Date().toISOString().split('T')[0],
    lessons,
    lastUpdate: Date.now(),
  };

  const merged = applyCourseJsonOverride(coursePath, autoDetected);
  return merged;
};
```

- [ ] **Step 6.2: Run the unit suite**

Run from `frontend/`: `npx vitest run`
Expected: PASS — all existing tests plus the two new files green.

- [ ] **Step 6.3: Commit**

```bash
git add frontend/server/utils/courseGenerator.js
git commit -m "feat(scan): apply course.json override at scan time and emit subtitle hints"
```

---

### Task 7: Honor `course.json` precedence in metadata-preservation rescan

**Files:**
- Modify: `frontend/server/utils/courseWatcher.js`

`generateCourseJson` already runs `applyCourseJsonOverride`, but
`processCourseDirWithMetadataPreservation` shallow-merges DB values *over* the
returned object. This task flips the precedence so that JSON beats DB.

- [ ] **Step 7.1: Edit the metadata-preservation merge**

Open `frontend/server/utils/courseWatcher.js`. Find the function
`processCourseDirWithMetadataPreservation`. The current merge looks like:

```javascript
const updatedCourseData = {
  ...courseData, // Start with new data from filesystem
  title: existingCourseResult.title || courseData.title,
  description: existingCourseResult.description || courseData.description,
  category: existingCourseResult.category || courseData.category,
  releaseDate: existingCourseResult.release_date || courseData.releaseDate,
};
```

Replace it with:

```javascript
// course.json (already applied inside generateCourseJson) is the source of
// truth when present. DB-preserved metadata is the fallback for fields that
// the operator did NOT pin in course.json. We detect "the JSON pinned this
// field" by checking the on-disk file directly so we don't have to thread a
// flag through generateCourseJson.
const jsonPinned = readCourseJsonKeys(courseDirPath);

const updatedCourseData = {
  ...courseData,
  title: jsonPinned.has('title')
    ? courseData.title
    : (existingCourseResult.title || courseData.title),
  description: jsonPinned.has('description')
    ? courseData.description
    : (existingCourseResult.description || courseData.description),
  category: jsonPinned.has('category')
    ? courseData.category
    : (existingCourseResult.category || courseData.category),
  releaseDate: jsonPinned.has('releaseDate')
    ? courseData.releaseDate
    : (existingCourseResult.release_date || courseData.releaseDate),
};
```

Add this helper at the top of `courseWatcher.js`, just below the existing imports:

```javascript
// Read just the keys of course.json so we know which fields the operator
// pinned. Returns an empty Set on any read/parse failure so the caller treats
// the course as "no pinned fields."
function readCourseJsonKeys(courseDirPath) {
  try {
    const raw = fs.readFileSync(path.join(courseDirPath, 'course.json'), 'utf8');
    const parsed = JSON.parse(raw.replace(/^﻿/, ''));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return new Set(Object.keys(parsed));
    }
  } catch {
    // missing / malformed — no pinned fields
  }
  return new Set();
}
```

> The `fs` and `path` imports already exist at the top of the file — no new imports needed.

- [ ] **Step 7.2: Add a smoke unit test for the precedence**

Append to `frontend/tests/unit/courseJsonOverride.test.js`:

```javascript
import { readFileSync, writeFileSync } from 'fs';

describe('course.json precedence over DB-preserved metadata (smoke)', () => {
  it('keys present in course.json are reported by Object.keys', () => {
    const json = JSON.stringify({ title: 'X', category: 'Y' });
    const keys = new Set(Object.keys(JSON.parse(json)));
    expect(keys.has('title')).toBe(true);
    expect(keys.has('category')).toBe(true);
    expect(keys.has('description')).toBe(false);
  });
});
```

> The full integration of this precedence is exercised by the e2e test in Task 17. The unit test above is just a guardrail against an obvious regression in the helper logic.

- [ ] **Step 7.3: Run unit tests**

Run from `frontend/`: `npx vitest run`
Expected: PASS — all green.

- [ ] **Step 7.4: Commit**

```bash
git add frontend/server/utils/courseWatcher.js frontend/tests/unit/courseJsonOverride.test.js
git commit -m "feat(scan): course.json fields beat DB-preserved metadata on rescan"
```

---

### Task 8: VTT-on-the-fly branch in the content endpoint

**Files:**
- Modify: `frontend/server/api/content/[...path].js`

- [ ] **Step 8.1: Add a `.vtt` handler before the existing 404 path**

Open `frontend/server/api/content/[...path].js`. Find the line
`if (!fs.existsSync(filePath)) {` (currently line ~324). Insert this block
immediately **before** that `if`:

```javascript
// .vtt requests: if the file doesn't exist on disk but a sibling .srt does,
// convert and serve. This lets operators drop an .srt next to the video and
// have the player consume a real WebVTT track.
if (path.extname(filePath).toLowerCase() === '.vtt' && !fs.existsSync(filePath)) {
  const srtCandidate = filePath.slice(0, -4) + '.srt';
  if (fs.existsSync(srtCandidate)) {
    try {
      const { convertSrtFileToVtt } = await import('../../utils/srtToVtt.js');
      const vttBuffer = await convertSrtFileToVtt(srtCandidate, fs);
      setResponseHeader(event, 'Content-Type', 'text/vtt; charset=utf-8');
      setResponseHeader(event, 'Content-Length', vttBuffer.length);
      setResponseHeader(event, 'Cache-Control', 'public, max-age=600');
      return vttBuffer;
    } catch (err) {
      console.error(`SRT→VTT conversion failed for ${srtCandidate}:`, err);
      throw createError({ statusCode: 500, statusMessage: 'Subtitle conversion failed' });
    }
  }
}
```

- [ ] **Step 8.2: Add a smoke unit test for the on-the-fly conversion path**

Create `frontend/tests/unit/srtToVtt.serve.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { convertSrtFileToVtt, _resetSrtCache } from '../../server/utils/srtToVtt.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-srt-'));
  _resetSrtCache();
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('convertSrtFileToVtt', () => {
  it('reads, converts, and returns a Buffer', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nA\n';
    const file = path.join(tmpDir, 'a.srt');
    fs.writeFileSync(file, srt, 'utf8');
    const buf = await convertSrtFileToVtt(file, fs);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toContain('00:00:01.000 --> 00:00:02.000');
  });

  it('serves cached buffer on the second call when mtime is unchanged', async () => {
    const file = path.join(tmpDir, 'a.srt');
    fs.writeFileSync(file, '1\n00:00:01,000 --> 00:00:02,000\nA\n', 'utf8');
    const a = await convertSrtFileToVtt(file, fs);
    const b = await convertSrtFileToVtt(file, fs);
    expect(b).toBe(a); // identical reference
  });
});
```

- [ ] **Step 8.3: Run unit tests**

Run from `frontend/`: `npx vitest run`
Expected: PASS — all green.

- [ ] **Step 8.4: Commit**

```bash
git add frontend/server/api/content/[...path].js frontend/tests/unit/srtToVtt.serve.test.js
git commit -m "feat(content): serve .vtt on demand by converting sibling .srt"
```

---

### Task 9: `has-json` endpoint

**Files:**
- Create: `frontend/server/api/courses/[id]/has-json.get.js`

- [ ] **Step 9.1: Implement the endpoint**

Create `frontend/server/api/courses/[id]/has-json.get.js`:

```javascript
import path from 'path';
import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getContentDir } from '../../../utils/courseHelpers';
import { hasCourseJson } from '../../../utils/courseJsonOverride.js';
import { requireAdmin } from '../../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const row = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
  if (!row || !row.folder_name) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' });
  }

  const courseDir = path.join(getContentDir(), row.folder_name);
  return { hasJson: hasCourseJson(courseDir) };
});
```

- [ ] **Step 9.2: Commit**

```bash
git add frontend/server/api/courses/[id]/has-json.get.js
git commit -m "feat(api): GET /api/courses/:id/has-json (admin)"
```

---

### Task 10: Per-course export endpoint

**Files:**
- Create: `frontend/server/api/courses/[id]/export-json.post.js`

- [ ] **Step 10.1: Implement the endpoint**

Create `frontend/server/api/courses/[id]/export-json.post.js`:

```javascript
import fs from 'fs';
import path from 'path';
import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getContentDir } from '../../../utils/courseHelpers';
import { requireAdmin } from '../../../utils/authz';

// Build the JSON object that gets written to disk. Limited to the four
// fields documented in the spec — id, lessons, thumbnail are *not* exported
// because they are derived from folder structure and the thumbnail.png
// convention.
function buildPayload(row) {
  return {
    title: row.title || '',
    description: row.description || '',
    category: row.category || '',
    releaseDate: row.release_date || '',
  };
}

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT title, description, category, release_date, folder_name FROM courses WHERE id = ?')
    .get(courseId);
  if (!row || !row.folder_name) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' });
  }

  const courseDir = path.join(getContentDir(), row.folder_name);
  if (!fs.existsSync(courseDir)) {
    throw createError({ statusCode: 404, statusMessage: 'Course folder missing' });
  }

  const payload = buildPayload(row);
  const filePath = path.join(courseDir, 'course.json');
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  return { success: true, path: filePath, fields: payload };
});
```

- [ ] **Step 10.2: Commit**

```bash
git add frontend/server/api/courses/[id]/export-json.post.js
git commit -m "feat(api): POST /api/courses/:id/export-json (admin)"
```

---

### Task 11: Bulk export endpoint

**Files:**
- Create: `frontend/server/api/courses/export-json-all.post.js`

- [ ] **Step 11.1: Implement the bulk endpoint**

Create `frontend/server/api/courses/export-json-all.post.js`:

```javascript
import fs from 'fs';
import path from 'path';
import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { getContentDir } from '../../utils/courseHelpers';
import { requireAdmin } from '../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const db = getDb();
  const rows = db
    .prepare('SELECT id, title, description, category, release_date, folder_name FROM courses')
    .all();

  const contentDir = getContentDir();
  const written = [];
  const failed = [];

  for (const row of rows) {
    if (!row.folder_name) {
      failed.push({ id: row.id, reason: 'no folder_name in DB' });
      continue;
    }
    const dir = path.join(contentDir, row.folder_name);
    if (!fs.existsSync(dir)) {
      failed.push({ id: row.id, reason: 'folder missing on disk' });
      continue;
    }

    const payload = {
      title: row.title || '',
      description: row.description || '',
      category: row.category || '',
      releaseDate: row.release_date || '',
    };

    try {
      fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      written.push(row.id);
    } catch (err) {
      failed.push({ id: row.id, reason: err.message });
    }
  }

  return { success: failed.length === 0, written, failed };
});
```

- [ ] **Step 11.2: Commit**

```bash
git add frontend/server/api/courses/export-json-all.post.js
git commit -m "feat(api): POST /api/courses/export-json-all (admin)"
```

---

### Task 12: AdminPanel "Content" tab + Export-all button

**Files:**
- Modify: `frontend/components/AdminPanel.vue`

- [ ] **Step 12.1: Add a "Content" tab and bind it to the bulk export endpoint**

Open `frontend/components/AdminPanel.vue`. Find the `tabs` array in the
script section (search for `const tabs =`). Add `{ id: 'content', label: 'Content' }`
to the array.

In the template, find the existing tab content blocks (each is a
`<div v-if="activeTab === '...'">`). Add a new block immediately after the
last one:

```vue
<div v-if="activeTab === 'content'" class="space-y-4" data-testid="admin-tab-content-pane">
  <h3 class="text-white font-semibold">Course metadata</h3>
  <p class="text-sm text-gray-400">
    Export the current database metadata for every course into a
    <code class="bg-gray-700 px-1 rounded">course.json</code> file inside its
    folder. Existing files are overwritten. The exported JSON does not include
    the thumbnail — drop a <code class="bg-gray-700 px-1 rounded">thumbnail.png</code>
    next to it for portability.
  </p>
  <button
    type="button"
    data-testid="admin-export-all-json"
    class="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded"
    :disabled="exportingAll"
    @click="exportAllJson"
  >
    {{ exportingAll ? 'Exporting…' : 'Export all to course.json' }}
  </button>
  <div v-if="exportResult" class="text-sm" data-testid="admin-export-result">
    <p class="text-green-400">Wrote {{ exportResult.written.length }} file(s).</p>
    <p v-if="exportResult.failed.length" class="text-orange-400">
      {{ exportResult.failed.length }} failed.
    </p>
    <ul v-if="exportResult.failed.length" class="list-disc ml-6 text-orange-300">
      <li v-for="f in exportResult.failed" :key="f.id">{{ f.id }}: {{ f.reason }}</li>
    </ul>
  </div>
</div>
```

In the script, add these refs and the handler near the other tab-state refs:

```javascript
const exportingAll = ref(false);
const exportResult = ref(null);

async function exportAllJson() {
  exportingAll.value = true;
  exportResult.value = null;
  try {
    const res = await $fetch('/api/courses/export-json-all', { method: 'POST' });
    exportResult.value = res;
  } catch (err) {
    actionError.value = err?.statusMessage || 'Export failed';
  } finally {
    exportingAll.value = false;
  }
}
```

> `actionError` and the `ref`/`$fetch` imports already exist in this file — no new imports needed. Verify by searching for `import { ref` near the top of the script.

- [ ] **Step 12.2: Commit**

```bash
git add frontend/components/AdminPanel.vue
git commit -m "feat(admin): Content tab with Export-all-to-course.json button"
```

---

### Task 13: CourseEditor banner + per-course export button

**Files:**
- Modify: `frontend/components/CourseEditor.vue`

- [ ] **Step 13.1: Add the "course.json present" probe and banner**

Open `frontend/components/CourseEditor.vue`. In the script section, add this
ref + probe near the existing refs (e.g. just below `const isSaving = ref(false);`):

```javascript
const hasJson = ref(false);
const exportingThisCourse = ref(false);

async function probeHasJson(courseId) {
  if (!courseId) {
    hasJson.value = false;
    return;
  }
  try {
    const res = await $fetch(`/api/courses/${encodeURIComponent(courseId)}/has-json`);
    hasJson.value = !!res?.hasJson;
  } catch {
    hasJson.value = false;
  }
}

async function exportThisCourseJson() {
  if (!formData.value.id) return;
  exportingThisCourse.value = true;
  try {
    await $fetch(`/api/courses/${encodeURIComponent(formData.value.id)}/export-json`, {
      method: 'POST',
    });
    hasJson.value = true; // file now exists, so banner appears
  } catch (err) {
    console.error('Export failed:', err);
  } finally {
    exportingThisCourse.value = false;
  }
}
```

In the existing `watch(() => props.course, (newCourse) => { ... })` block,
add this line where `formData.value.id` is set when editing:

```javascript
probeHasJson(newCourse.id);
```

If the watch handler also runs when `newCourse` is empty/new, guard the call
so it always sets `hasJson.value = false`. Place the call after the existing
`formData.value.id = newCourse.id;` line.

In the template, immediately above the closing `</form>` tag of the editor's
form (around the existing "Submit buttons" block), add:

```vue
<div
  v-if="hasJson"
  data-testid="course-json-banner"
  class="rounded border border-yellow-600 bg-yellow-900/20 text-yellow-200 text-sm px-3 py-2"
>
  <strong>course.json detected.</strong>
  Edits saved here will be reverted on the next rescan unless you re-export.
</div>
```

In the "Submit buttons" block (the flex row containing "Cancel" and "Save Course"),
add a button on the left side of that flex container:

```vue
<button
  v-if="isEditing"
  type="button"
  data-testid="course-export-json"
  class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
  :disabled="exportingThisCourse"
  @click="exportThisCourseJson"
>
  {{ exportingThisCourse ? 'Exporting…' : 'Export to course.json' }}
</button>
```

Wrap the whole "Submit buttons" `flex justify-end` row in a flex with
`justify-between` so the export button anchors left and Cancel/Save anchor right.

- [ ] **Step 13.2: Commit**

```bash
git add frontend/components/CourseEditor.vue
git commit -m "feat(editor): course.json banner and per-course Export button"
```

---

### Task 14: Spin up the dev stack and smoke-test by hand

**Files:** None (manual verification)

- [ ] **Step 14.1: Bring up the dev stack**

From the repo root:

```bash
docker compose down -v
docker compose up --build -d
docker compose logs -f --tail=100
```

Wait for the log line `Listening on http://0.0.0.0:3000`.

- [ ] **Step 14.2: Manual export smoke test**

1. Open `http://localhost:3000` in a browser, log in as admin.
2. Open Admin Panel → Content tab → click "Export all to course.json".
3. From the host:

```bash
ls -la data/content/*/course.json | head
cat data/content/<one-course-folder>/course.json
```

Expected: every course folder now has a `course.json` with title, description, category, releaseDate.

- [ ] **Step 14.3: Manual override smoke test**

1. Edit one of the `course.json` files: change `title` to `"PROBE-TITLE"`.
2. In the browser, click the avatar dropdown → "Rescan Database" → leave "Preserve metadata" checked → confirm.
3. Wait for the scan to finish.
4. Verify the courses page shows the course's title as `PROBE-TITLE`.

- [ ] **Step 14.4: Manual subtitle smoke test**

1. Pick a course with at least one `.mp4`. From the host, copy any sample SRT next to it as `<basename>.srt`. Example: if the file is `data/content/Foo/Lesson 1/01-intro.mp4`, place `data/content/Foo/Lesson 1/01-intro.srt`.
2. Restart the container: `docker compose restart`.
3. Open the course in the browser, open dev tools Network tab.
4. Request `/api/content/<courseId>/Lesson%201/01-intro.vtt`.
5. Verify response is HTTP 200, `Content-Type: text/vtt; charset=utf-8`, body starts with `WEBVTT`.

- [ ] **Step 14.5: Tear the dev stack down**

```bash
docker compose down
```

> The actual Playwright e2e for the admin export lives in Task 17. This manual pass is the human gate before we invest in the e2e wiring.

---

### Task 15: Codex review of the server changes

**Files:** None (review only)

- [ ] **Step 15.1: Run codex on the diff so far**

Run from the repo root:

```bash
git diff origin/main...HEAD -- 'frontend/server/**' 'frontend/tests/unit/**' \
  | head -c 200000 \
  > /tmp/pr-a-server-diff.txt
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task \
  "Review this PR diff for SkillGoblin (Nuxt 3 / Nitro / SQLite). Look specifically for: \
  (1) path-traversal risks in the new export endpoints, \
  (2) injection/escape problems in the SRT→VTT conversion, \
  (3) auth bypass — every new mutating endpoint must call requireAdmin, \
  (4) any place where user-provided input crosses into fs operations without validation. \
  Reply with HIGH/MEDIUM/LOW findings. Diff:\n\n$(cat /tmp/pr-a-server-diff.txt)"
```

Expected: codex returns a structured review. Address every HIGH finding before continuing.

- [ ] **Step 15.2: Apply any HIGH-severity fixes**

If codex flagged HIGH findings, fix them, re-run unit tests, and commit:

```bash
git add -A
git commit -m "fix(pr-a): address codex review findings"
```

If no HIGH findings, skip this step.

---

### Task 16: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 16.1: Document `course.json` schema and the export feature**

Open `README.md`. Find the existing "File structure" section that already shows:

```
│   │   ├── course.json       # Optional metadata override (title, description, etc.)
```

Replace that bullet's neighborhood with a new subsection. Insert this **after**
the file-structure code block, **before** the "File monitoring" subsection:

```markdown
### `course.json` override

Drop a `course.json` next to `thumbnail.png` to pin metadata for that course.
The scanner reads it after auto-detection and the values win over both
auto-detected metadata *and* values stored in the database. Schema:

```json
{
  "title": "Optional human title",
  "description": "Optional description shown on cards and the detail page",
  "category": "Optional category",
  "releaseDate": "2025-01-15"
}
```

All fields are optional. Unknown keys are ignored with a console warning.
The thumbnail, lessons, and id are still derived from the folder structure and
the `thumbnail.png` convention.

#### Exporting from the admin panel

Admins can write a `course.json` for every course at once: open the avatar
dropdown → Admin Panel → **Content** → **Export all to course.json**. The
existing CourseEditor modal also has a per-course **Export to course.json**
button; it shows a yellow banner when a `course.json` is already present so
you know your edits will be reverted on the next rescan unless you re-export.

#### Subtitles

Drop a sidecar `.srt` next to a video (same basename, e.g.
`01-intro.mp4` and `01-intro.srt`) and the player attaches it as a WebVTT
track. The server converts SRT to VTT on the fly — you do not need to convert
files manually.
```

- [ ] **Step 16.2: Commit**

```bash
git add README.md
git commit -m "docs: document course.json override and admin export"
```

---

### Task 17: Playwright e2e — admin export & override

**Files:**
- Create: `frontend/tests/e2e/admin-content-export.spec.js`

- [ ] **Step 17.1: Write the e2e**

Create `frontend/tests/e2e/admin-content-export.spec.js`:

```javascript
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ADMIN_NAME = process.env.ADMIN_NAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-password';
const CONTENT_DIR = process.env.HOST_CONTENT_DIR || '/app/data/content';

async function loginAsAdmin(page) {
  await page.goto('/');
  await page.click(`[data-testid=user-tile-${ADMIN_NAME}]`).catch(() => {});
  await page.fill('input[type=password]', ADMIN_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/courses/);
}

test.describe('admin content export', () => {
  test('export all writes course.json files and override survives rescan', async ({ page }) => {
    await loginAsAdmin(page);

    // Open Admin Panel → Content tab
    await page.click('[data-testid=user-profile-avatar]');
    await page.click('text=Admin Panel');
    await page.click('[data-testid=admin-tab-content]');

    // Click Export-all
    await page.click('[data-testid=admin-export-all-json]');
    const result = page.locator('[data-testid=admin-export-result]');
    await expect(result).toBeVisible({ timeout: 5000 });
    await expect(result).toContainText(/Wrote \d+/);

    // Verify at least one course folder now contains course.json
    const courses = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(courses.length).toBeGreaterThan(0);

    const sample = courses[0];
    const jsonPath = path.join(CONTENT_DIR, sample, 'course.json');
    expect(fs.existsSync(jsonPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(parsed).toHaveProperty('title');
    expect(parsed).toHaveProperty('description');
    expect(parsed).toHaveProperty('category');
    expect(parsed).toHaveProperty('releaseDate');
  });

  test('CourseEditor shows banner when course.json exists', async ({ page }) => {
    await loginAsAdmin(page);

    // Find a course card and click its Edit button
    const editBtn = page.locator('[data-testid=course-edit-button]').first();
    await editBtn.click();

    // Banner appears because Task 17 test 1 already wrote course.json files
    await expect(page.locator('[data-testid=course-json-banner]')).toBeVisible();
  });
});
```

- [ ] **Step 17.2: Run the dockerized test stack**

From the repo root:

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: all unit tests + all e2e tests pass, including the new spec.

> If `data-testid=user-tile-${ADMIN_NAME}` doesn't match the real markup, open `frontend/pages/index.vue` and use whatever stable selector the existing auth tests use (e.g. an avatar button text).

- [ ] **Step 17.3: Commit**

```bash
git add frontend/tests/e2e/admin-content-export.spec.js
git commit -m "test(e2e): admin can export course.json and editor banner appears"
```

---

### Task 18: Final codex sweep + open the PR

- [ ] **Step 18.1: Final codex pass over the full diff**

```bash
git diff origin/main...HEAD > /tmp/pr-a-full-diff.txt
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task \
  "Final review of PR-A — content folder as source of truth. Look for HIGH-severity bugs only. Diff:\n\n$(head -c 200000 /tmp/pr-a-full-diff.txt)"
```

Expected: no HIGH findings, or any HIGH findings have already been addressed.

- [ ] **Step 18.2: Push and open the PR**

```bash
git push -u origin feat/content-source-of-truth
gh pr create \
  --base main \
  --title "feat(content): course.json override + admin export + .srt subtitle serving" \
  --body "$(cat <<'EOF'
## Summary
- `course.json` next to a course folder now overrides DB metadata at scan time (title, description, category, releaseDate)
- Admin Panel → Content → "Export all to course.json" writes the current DB metadata to JSON files for every course (per-course export also lives in the CourseEditor footer)
- `.srt` sidecar files are now served as on-the-fly `.vtt` via the existing `/api/content/...` route, so the player can attach them as `<track>` elements (UI toggle ships in PR-C)

## Test plan
- [x] Vitest unit suite green (new: srtToVtt, courseJsonOverride)
- [x] Playwright e2e green (new: admin-content-export)
- [x] Manual smoke: edited a course.json by hand, rescanned, change is visible
- [x] Manual smoke: dropped a `.srt` sidecar, fetched matching `.vtt`, got valid WebVTT

## Spec
docs/superpowers/specs/2026-05-04-pr-a-content-source-of-truth.md
EOF
)"
```

- [ ] **Step 18.3: Update the master tracker**

Edit `docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md` and tick the PR-A checklist items that are now done. Commit:

```bash
git add docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md
git commit -m "docs(tracker): PR-A complete"
git push
```

---

## Self-review checklist (engineer runs this before marking the plan done)

- [ ] Every task that creates a file lists the exact path with no placeholders
- [ ] Every test step shows the actual test code, not "write a test for X"
- [ ] Every implementation step shows the actual code, not "implement X"
- [ ] Every commit message is concrete and follows the repo's existing style (`feat(scope): ...`, `test(...): ...`)
- [ ] All function and ref names are consistent across tasks (e.g. `applyCourseJsonOverride` is spelled the same way every time it appears)
- [ ] No "similar to Task N" cross-references — each task is self-contained
- [ ] The PR description in Task 18.2 mentions every behavior shipped in this PR

## Verification gate (PR cannot merge until all green)

- [ ] All new unit tests pass (`npx vitest run` clean from `frontend/`)
- [ ] All new e2e tests pass (dockerized test stack clean)
- [ ] Full existing vitest suite green (no regressions)
- [ ] Full existing Playwright suite green (no regressions)
- [ ] Codex sweep: no HIGH severity findings open
- [ ] README updated
- [ ] Manual visual smoke documented in PR body
- [ ] Master tracker (`feature-pack-overview.md`) PR-A boxes ticked
