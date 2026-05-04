# PR-C — Player correctness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the resume-from-zero bug, make a course open at the user's
next-not-completed video at the saved position, add a CC subtitle toggle
backed by `localStorage`, and persist playback speed across courses.

**Architecture:** Two pure helpers — `smartOpen.js` (next-not-completed
selection) and `playerPreferences.js` (localStorage CC + speed) — feed a
single source of truth for seeking inside the video player.
[`VideoPlayer.vue`](../../../frontend/components/video/VideoPlayer.vue) loses
its internal `loadedmetadata` listener; the parent at
[`pages/courses/[id].vue`](../../../frontend/pages/courses/[id].vue) drives
seeking via a real `currentTime` prop. The `<track>` element is rendered when
`subtitleSrc` is non-empty (PR-A populates the upstream payload field).

**Tech Stack:** Vue 3 SFC, native HTML5 `<video>` element, `<track>` with
WebVTT, `localStorage`, Vitest unit + Playwright e2e.

**Spec:** [pr-c-player-correctness.md](../specs/2026-05-04-pr-c-player-correctness.md)
**Branch:** `feat/player-correctness` (cut from `main` at task 1, *after*
PR-A has merged so the `subtitle` payload field is available — see
[overview](../specs/2026-05-04-skillgoblin-feature-pack-overview.md))

---

## File map

### New files

| Path | Responsibility |
|---|---|
| `frontend/utils/smartOpen.js` | Pure function: given lessons + progress, return `{ lesson, video, seekRatio }` |
| `frontend/utils/playerPreferences.js` | Pure helpers around `localStorage` for CC default + playback rate |
| `frontend/tests/unit/smartOpen.test.js` | Unit tests for the selection algorithm |
| `frontend/tests/unit/playerPreferences.test.js` | Unit tests for the preference helpers (jsdom localStorage) |
| `frontend/tests/e2e/player-resume.spec.js` | E2E for resume-from-position + smart open |
| `frontend/tests/e2e/player-cc-and-speed.spec.js` | E2E for CC toggle + speed memory |

### Modified files

| Path | Change |
|---|---|
| `frontend/components/video/VideoPlayer.vue` | Make `currentTime` reactive, remove internal listener, add `subtitleSrc` prop + `<track>`, add CC button + speed dropdown, read/write localStorage |
| `frontend/pages/courses/[id].vue` | Drive `currentTimeForPlayer` via parent, replace lesson-1-video-1 select with smart open, add "Start from beginning" link, plumb `subtitleSrc` |
| `frontend/vitest.config.js` | Add `jsdom` environment for the preferences test only (or pass `// @vitest-environment jsdom` in the test file — preferred to avoid global config change) |

---

## Task list

### Task 1: Cut the feature branch

- [ ] **Step 1.1: Wait for PR-A to merge, then cut**

Verify `main` includes PR-A's `subtitle` field on the course payload.

```bash
git fetch origin
git switch -c feat/player-correctness origin/main
```

If PR-A has not merged yet, the CC toggle section will compile but stay hidden — see the spec's "Cross-PR dependency" section. You can still ship the resume fix, smart open, and speed memory portions independently.

---

### Task 2: smartOpen helper — failing test

**Files:**
- Create: `frontend/tests/unit/smartOpen.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `frontend/tests/unit/smartOpen.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { pickNextNotCompleted } from '../../utils/smartOpen.js';

const lessons = [
  {
    id: 'l1',
    title: 'Lesson 1',
    folder: 'Lesson 1',
    videos: [
      { title: 'V1', file: 'v1.mp4' },
      { title: 'V2', file: 'v2.mp4' },
    ],
  },
  {
    id: 'l2',
    title: 'Lesson 2',
    folder: 'Lesson 2',
    videos: [
      { title: 'V3', file: 'v3.mp4' },
      { title: 'V4', file: 'v4.mp4' },
    ],
  },
];

describe('pickNextNotCompleted', () => {
  it('picks lesson 1 video 1 with seekRatio 0 when there is no progress', () => {
    const r = pickNextNotCompleted(lessons, { completed: {}, progress: {} });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(0);
    expect(r.seekRatio).toBe(0);
  });

  it('skips completed videos and resumes the first non-completed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: { 'l1-0': true, 'l1-1': true, 'l2-0': true },
      progress: {},
    });
    expect(r.lessonId).toBe('l2');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBe(0);
  });

  it('returns the seekRatio for a partially-watched first non-completed video', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: { 'l1-0': true },
      progress: { 'l1-1': 30 },
    });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBeCloseTo(0.3);
  });

  it('falls back to the last video when every video is completed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: {
        'l1-0': true, 'l1-1': true, 'l2-0': true, 'l2-1': true,
      },
      progress: {},
    });
    expect(r.lessonId).toBe('l2');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBe(0);
  });

  it('clamps seekRatio to the [0, 1) range when progress is malformed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: {},
      progress: { 'l1-0': 250 }, // someone wrote 250% — clamp
    });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(0);
    expect(r.seekRatio).toBeLessThan(1);
    expect(r.seekRatio).toBeGreaterThanOrEqual(0);
  });

  it('returns null for empty courses', () => {
    expect(pickNextNotCompleted([], { completed: {}, progress: {} })).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run — fails**

```bash
npx vitest run tests/unit/smartOpen.test.js
```

Expected: FAIL — module not found.

---

### Task 3: smartOpen helper — implementation

**Files:**
- Create: `frontend/utils/smartOpen.js`

- [ ] **Step 3.1: Implement**

Create `frontend/utils/smartOpen.js`:

```javascript
// Given a course's lessons array and a per-user progress shape
//   { completed: { [`${lessonId}-${index}`]: true }, progress: { [`${lessonId}-${index}`]: 0..100 } }
// return the first not-completed video and its seek ratio (0..<1).
//
// If every video is completed, returns the last video with seekRatio=0 so the
// page still has something selected. Returns null only when the lessons array
// is empty.
//
// This is a pure function — no DOM, no fetch, no localStorage. The caller
// turns seekRatio into seconds once duration is known.
export function pickNextNotCompleted(lessons, progress) {
  if (!Array.isArray(lessons) || lessons.length === 0) return null;
  const completed = (progress && progress.completed) || {};
  const partials = (progress && progress.progress) || {};

  let lastVideo = null;
  for (let li = 0; li < lessons.length; li += 1) {
    const lesson = lessons[li];
    if (!lesson || !Array.isArray(lesson.videos)) continue;
    for (let vi = 0; vi < lesson.videos.length; vi += 1) {
      const id = `${lesson.id}-${vi}`;
      lastVideo = { lessonId: lesson.id, videoIndex: vi };
      if (completed[id]) continue;
      const raw = Number(partials[id]) || 0;
      const clamped = Math.max(0, Math.min(99.999, raw));
      return {
        lessonId: lesson.id,
        videoIndex: vi,
        seekRatio: clamped / 100,
      };
    }
  }
  // every video completed — return the last we saw, time 0
  if (!lastVideo) return null;
  return { ...lastVideo, seekRatio: 0 };
}
```

- [ ] **Step 3.2: Run — passes**

```bash
npx vitest run tests/unit/smartOpen.test.js
```

Expected: PASS — 6 tests green.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/utils/smartOpen.js frontend/tests/unit/smartOpen.test.js
git commit -m "feat(player): pure smart-open selection helper"
```

---

### Task 4: playerPreferences helper — failing test

**Files:**
- Create: `frontend/tests/unit/playerPreferences.test.js`

- [ ] **Step 4.1: Write the failing test**

Create `frontend/tests/unit/playerPreferences.test.js`:

```javascript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CC_KEY,
  RATE_KEY,
  getCcDefault,
  setCcDefault,
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('CC default', () => {
  it('returns false when key is missing', () => {
    expect(getCcDefault()).toBe(false);
  });
  it('round-trips a true value', () => {
    setCcDefault(true);
    expect(window.localStorage.getItem(CC_KEY)).toBe('1');
    expect(getCcDefault()).toBe(true);
  });
  it('round-trips a false value', () => {
    setCcDefault(false);
    expect(window.localStorage.getItem(CC_KEY)).toBe('0');
    expect(getCcDefault()).toBe(false);
  });
});

describe('playback rate', () => {
  it('returns 1 when key is missing', () => {
    expect(getPlaybackRate()).toBe(1);
  });
  it('round-trips a valid rate', () => {
    setPlaybackRate(1.5);
    expect(window.localStorage.getItem(RATE_KEY)).toBe('1.5');
    expect(getPlaybackRate()).toBe(1.5);
  });
  it('returns 1 for invalid stored values', () => {
    window.localStorage.setItem(RATE_KEY, 'not-a-number');
    expect(getPlaybackRate()).toBe(1);
    window.localStorage.setItem(RATE_KEY, '99'); // out of allowed range
    expect(getPlaybackRate()).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run — fails**

```bash
npx vitest run tests/unit/playerPreferences.test.js
```

Expected: FAIL — module not found.

---

### Task 5: playerPreferences helper — implementation

**Files:**
- Create: `frontend/utils/playerPreferences.js`

- [ ] **Step 5.1: Implement**

Create `frontend/utils/playerPreferences.js`:

```javascript
export const CC_KEY = 'skillgoblin:cc:default';
export const RATE_KEY = 'skillgoblin:playbackRate';

const ALLOWED_RATES = new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getCcDefault() {
  const s = safeStorage();
  if (!s) return false;
  return s.getItem(CC_KEY) === '1';
}

export function setCcDefault(value) {
  const s = safeStorage();
  if (!s) return;
  s.setItem(CC_KEY, value ? '1' : '0');
}

export function getPlaybackRate() {
  const s = safeStorage();
  if (!s) return 1;
  const raw = s.getItem(RATE_KEY);
  if (raw == null) return 1;
  const n = Number(raw);
  if (Number.isNaN(n) || !ALLOWED_RATES.has(n)) return 1;
  return n;
}

export function setPlaybackRate(value) {
  const s = safeStorage();
  if (!s) return;
  if (!ALLOWED_RATES.has(Number(value))) return;
  s.setItem(RATE_KEY, String(value));
}
```

- [ ] **Step 5.2: Run — passes**

```bash
npx vitest run tests/unit/playerPreferences.test.js
```

Expected: PASS — 6 tests green.

> If vitest complains about jsdom not being installed, run `npm i -D jsdom@latest` from `frontend/` first.

- [ ] **Step 5.3: Commit**

```bash
git add frontend/utils/playerPreferences.js frontend/tests/unit/playerPreferences.test.js
git commit -m "feat(player): localStorage helpers for CC default and playback rate"
```

---

### Task 6: Refactor VideoPlayer.vue — `currentTime` becomes a real prop

**Files:**
- Modify: `frontend/components/video/VideoPlayer.vue`

This is the headline fix for the resume bug. We remove the internal
`loadedmetadata` listener and add a watcher on `props.currentTime` that
drives seeking. The parent already emits `loadedmetadata` upward, so the
parent stays the single source of truth.

- [ ] **Step 6.1: Replace the script section**

Open `frontend/components/video/VideoPlayer.vue`. Replace the entire
`<script setup>` block with:

```javascript
import { ref, watch, onMounted } from 'vue';
import {
  getCcDefault,
  setCcDefault,
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

const props = defineProps({
  src: { type: String, default: '' },
  autoplay: { type: Boolean, default: false },
  currentTime: { type: Number, default: 0 },
  subtitleSrc: { type: String, default: '' },
  placeholderText: { type: String, default: 'Select a video to start' },
});

const emit = defineEmits(['timeupdate', 'ended', 'loadedmetadata']);

const player = ref(null);
const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const playbackRate = ref(1);
const ccOn = ref(false);

// Apply the current target time to the player. Safe to call before the
// element is ready — the watcher handles re-application after `loadedmetadata`.
function applySeek() {
  if (!player.value) return;
  const t = Number(props.currentTime);
  if (!Number.isFinite(t)) return;
  // Don't seek if we're already within 0.25s — avoids fighting the user.
  if (Math.abs(player.value.currentTime - t) > 0.25) {
    try { player.value.currentTime = t; } catch {}
  }
}

watch(() => props.src, (newSrc, oldSrc) => {
  if (newSrc === oldSrc || !player.value) return;
  player.value.pause();
  player.value.load();
}, { immediate: true });

watch(() => props.currentTime, () => applySeek());

function onLoadedMetadata(event) {
  applySeek();
  // Restore playback rate (browsers reset this on load)
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
  // Apply CC default to whatever track exists
  applyCcMode();
  if (props.autoplay && player.value) {
    try { player.value.play(); } catch {}
  }
  emit('loadedmetadata', event);
}

function applyCcMode() {
  if (!player.value) return;
  const tracks = player.value.textTracks;
  if (!tracks) return;
  for (let i = 0; i < tracks.length; i += 1) {
    tracks[i].mode = ccOn.value ? 'showing' : 'hidden';
  }
}

function toggleCc() {
  ccOn.value = !ccOn.value;
  setCcDefault(ccOn.value);
  applyCcMode();
}

function onRateChange(event) {
  const v = Number(event.target.value);
  if (!ALLOWED_RATES.includes(v)) return;
  playbackRate.value = v;
  setPlaybackRate(v);
  if (player.value) player.value.playbackRate = v;
}

onMounted(() => {
  ccOn.value = getCcDefault();
  playbackRate.value = getPlaybackRate();
  if (player.value) {
    player.value.playbackRate = playbackRate.value;
  }
});

defineExpose({
  play() { if (player.value) player.value.play(); },
  pause() { if (player.value) player.value.pause(); },
  getCurrentTime() { return player.value ? player.value.currentTime : 0; },
  getDuration() { return player.value ? player.value.duration : 0; },
  setCurrentTime(time) { if (player.value) player.value.currentTime = time; },
});
```

- [ ] **Step 6.2: Update the template**

Replace the `<template>` block with:

```vue
<template>
  <div class="bg-black dark:bg-gray-900 rounded-lg overflow-hidden">
    <div class="aspect-video">
      <video
        v-if="src"
        ref="player"
        class="w-full h-full"
        controls
        crossorigin="anonymous"
        @timeupdate="$emit('timeupdate', $event)"
        @ended="$emit('ended')"
        @loadedmetadata="onLoadedMetadata"
      >
        <source :key="src" :src="src" type="video/mp4">
        <track
          v-if="subtitleSrc"
          kind="subtitles"
          :src="subtitleSrc"
          srclang="en"
          label="English"
        >
        Your browser does not support the video tag.
      </video>
      <div v-else class="w-full h-full flex items-center justify-center">
        <p class="text-white dark:text-gray-400">{{ placeholderText }}</p>
      </div>
    </div>
    <div
      v-if="src"
      class="flex flex-wrap items-center gap-3 px-3 py-2 bg-gray-800 text-gray-200 text-sm"
      data-testid="player-controls"
    >
      <button
        v-if="subtitleSrc"
        type="button"
        data-testid="player-cc-toggle"
        class="px-2 py-1 rounded border"
        :class="ccOn ? 'border-primary-400 bg-primary-700/30' : 'border-gray-600 hover:border-gray-400'"
        :aria-pressed="ccOn"
        @click="toggleCc"
      >
        CC
      </button>
      <label class="flex items-center gap-1">
        <span class="text-xs uppercase tracking-wide text-gray-400">Speed</span>
        <select
          data-testid="player-speed"
          class="bg-gray-900 border border-gray-700 rounded px-1 py-0.5"
          :value="playbackRate"
          @change="onRateChange"
        >
          <option v-for="r in ALLOWED_RATES" :key="r" :value="r">{{ r }}×</option>
        </select>
      </label>
    </div>
  </div>
</template>
```

- [ ] **Step 6.3: Commit**

```bash
git add frontend/components/video/VideoPlayer.vue
git commit -m "fix(player): single source of truth for seek, add CC toggle and speed memory"
```

---

### Task 7: Wire smart open and `currentTime` from `pages/courses/[id].vue`

**Files:**
- Modify: `frontend/pages/courses/[id].vue`

- [ ] **Step 7.1: Add the smart-open import and a `currentTimeForPlayer` ref**

Open the file. In the `<script setup>` imports, add:

```javascript
import { pickNextNotCompleted } from '~/utils/smartOpen.js';
```

Add a ref alongside the existing `videoPlayer`, `currentVideoId` etc.:

```javascript
const currentTimeForPlayer = ref(0);
const subtitleSrc = computed(() => {
  if (!currentVideo.value || !currentLesson.value) return '';
  if (!currentVideo.value.subtitle) return '';
  // The .vtt URL is the same path as the video, with the extension swapped.
  // PR-A's content endpoint converts a sibling .srt on demand.
  const courseId = encodeURIComponent(route.params.id);
  const lessonFolder = currentLesson.value.folder
    ? encodeURIComponent(currentLesson.value.folder)
    : '';
  const subtitleFilename = currentVideo.value.subtitle.replace(/\.srt$/i, '.vtt');
  const path = lessonFolder ? `/${lessonFolder}` : '';
  return `/api/content/${courseId}${path}/${encodeURIComponent(subtitleFilename)}`;
});
```

- [ ] **Step 7.2: Replace the lesson-1-video-1 select with smart open**

Find the watcher that runs on the loaded course (the `watch(course, (newCourseData) => { ... }, { immediate: true });` block).

Replace it with:

```javascript
watch([course, () => Object.keys(courseProgress.value).length], () => {
  const newCourseData = course.value;
  if (!newCourseData?.lessons?.length) return;
  // Collapse all lessons (matches the previous "expand only one" UX)
  Object.keys(expandedLessons.value).forEach((id) => {
    expandedLessons.value[id] = false;
  });

  // If a video is already selected (e.g. the user clicked one), don't override.
  if (currentVideo.value) return;

  const pick = pickNextNotCompleted(newCourseData.lessons, {
    completed: completedVideos.value,
    progress: videoProgress.value,
  });
  if (!pick) return;

  const lesson = newCourseData.lessons.find((l) => l.id === pick.lessonId);
  if (!lesson) return;
  const video = lesson.videos[pick.videoIndex];
  if (!video) return;

  expandedLessons.value[lesson.id] = true;

  // playVideo() with autoPlay=false keeps the existing pause-on-load UX.
  // We then compute the seek time once duration is known via handleVideoLoaded.
  currentLesson.value = lesson;
  currentVideo.value = video;
  currentVideoId.value = `${lesson.id}-${pick.videoIndex}`;
  currentTimeForPlayer.value = 0; // updated in handleVideoLoaded once duration known
}, { immediate: true });
```

- [ ] **Step 7.3: Update `handleVideoLoaded` to compute the seek**

Replace the existing function with:

```javascript
function handleVideoLoaded() {
  if (!videoPlayer.value || !currentVideoId.value) return;
  const duration = videoPlayer.value.getDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;
  const savedProgress = videoProgress.value[currentVideoId.value] || 0;
  if (savedProgress > 0 && savedProgress < 100) {
    currentTimeForPlayer.value = (savedProgress / 100) * duration;
  } else {
    currentTimeForPlayer.value = 0;
  }
}
```

- [ ] **Step 7.4: Pass the new prop to the player and add the "Start from beginning" link**

In the template, find the existing `<VideoPlayer ... />` element. Replace its props with:

```vue
<VideoPlayer
  ref="videoPlayer"
  class="mb-4"
  :src="currentVideoUrl"
  :autoplay="false"
  :current-time="currentTimeForPlayer"
  :subtitle-src="subtitleSrc"
  @timeupdate="updateProgress"
  @ended="markAsCompleted"
  @loadedmetadata="handleVideoLoaded"
/>
```

Below the `<VideoPlayer ... />`, before the `<VideoInfo ... />`, add:

```vue
<div class="text-xs text-gray-500 dark:text-gray-400 mb-3 text-right">
  <button
    type="button"
    data-testid="start-from-beginning"
    class="underline hover:text-gray-700 dark:hover:text-gray-200"
    @click="startFromBeginning"
  >
    Start from beginning
  </button>
</div>
```

In the script section, add the handler:

```javascript
function startFromBeginning() {
  if (!course.value?.lessons?.length) return;
  const firstLesson = course.value.lessons[0];
  if (!firstLesson?.videos?.length) return;
  const firstVideo = firstLesson.videos[0];
  Object.keys(expandedLessons.value).forEach((id) => {
    expandedLessons.value[id] = false;
  });
  expandedLessons.value[firstLesson.id] = true;
  currentLesson.value = firstLesson;
  currentVideo.value = firstVideo;
  currentVideoId.value = `${firstLesson.id}-0`;
  currentTimeForPlayer.value = 0;
}
```

- [ ] **Step 7.5: Commit**

```bash
git add frontend/pages/courses/[id].vue
git commit -m "feat(player): smart course-open + start-from-beginning override"
```

---

### Task 8: Manual verification of the resume bug fix

- [ ] **Step 8.1: Spin up dev stack**

```bash
docker compose up --build -d
```

- [ ] **Step 8.2: Reproduce + verify the fix**

1. Log in, open any course with a video that's longer than 60 seconds.
2. Play the first video for ~30 seconds, then click a different lesson's video — let it play 10 seconds, then navigate away (e.g. back to /courses).
3. Reopen the same course. Verify it auto-selects the partially-watched video and that the player shows ~10s on the timeline.
4. Click "Start from beginning" → the first video is selected at 0:00 and saved progress is **not** modified.
5. Refresh the page → the smart-open behavior repeats.

- [ ] **Step 8.3: Tear down**

```bash
docker compose down
```

---

### Task 9: E2E — resume + smart open

**Files:**
- Create: `frontend/tests/e2e/player-resume.spec.js`

- [ ] **Step 9.1: Write the e2e**

Create `frontend/tests/e2e/player-resume.spec.js`:

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

async function openFirstCourse(page) {
  // Click any course card title or thumbnail
  const card = page.locator('[data-testid=course-card], main h3').first();
  await card.click();
  await page.waitForURL(/\/courses\/[^/]+/);
  await page.waitForSelector('video');
}

test.describe('player resume + smart open', () => {
  test('partially-watched video resumes at saved position', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourse(page);

    // Save synthetic progress straight to the API so the test doesn't have to
    // wait through real video playback.
    const courseId = page.url().split('/').pop().split('?')[0];
    const userIdRes = await page.request.get('/api/auth/me');
    const userId = (await userIdRes.json())?.id;
    expect(userId).toBeTruthy();

    // Read course shape so we can pick a real lesson + video id pair
    const courseRes = await page.request.get(`/api/courses/${courseId}`);
    const course = await courseRes.json();
    const lesson = course.lessons[0];
    expect(lesson.videos.length).toBeGreaterThan(0);
    const targetId = `${lesson.id}-0`;

    await page.request.post(`/api/user-progress/${userId}`, {
      data: {
        courseId,
        data: {
          completed: {},
          progress: { [targetId]: 35 }, // 35%
          favorite: false,
          lastViewed: { lessonId: lesson.id, videoIndex: 0 },
        },
      },
    });

    // Reload the course page so smart open sees the saved progress
    await page.reload();
    await page.waitForSelector('video');

    // Wait for loadedmetadata + the parent's seek
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && Number.isFinite(v.duration) && v.duration > 0 && v.currentTime > 0;
    }, null, { timeout: 10000 });

    const ratio = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v.currentTime / v.duration;
    });
    // Allow a wide band — the saved progress is 35%, but the seek can land
    // a bit early on certain codecs.
    expect(ratio).toBeGreaterThan(0.20);
    expect(ratio).toBeLessThan(0.55);
  });

  test('Start from beginning resets to lesson 1 video 1 at time 0', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourse(page);

    await page.click('[data-testid=start-from-beginning]');
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.currentTime < 0.5;
    });
  });
});
```

- [ ] **Step 9.2: Run dockerized tests**

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: full vitest + Playwright suites green, including the two new tests.

> The resume e2e is the headline regression test for the bug. If it fails, do **not** ship — the seek logic is wrong.

- [ ] **Step 9.3: Commit**

```bash
git add frontend/tests/e2e/player-resume.spec.js
git commit -m "test(e2e): partially-watched video resumes at saved position"
```

---

### Task 10: E2E — CC toggle + speed memory

**Files:**
- Create: `frontend/tests/e2e/player-cc-and-speed.spec.js`

- [ ] **Step 10.1: Write the e2e**

Create `frontend/tests/e2e/player-cc-and-speed.spec.js`:

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

async function openFirstCourse(page) {
  const card = page.locator('[data-testid=course-card], main h3').first();
  await card.click();
  await page.waitForURL(/\/courses\/[^/]+/);
  await page.waitForSelector('video');
}

test.describe('player CC + speed', () => {
  test('speed selection persists across reload', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourse(page);
    await page.selectOption('[data-testid=player-speed]', '1.5');
    await page.reload();
    await page.waitForSelector('video');
    await expect(page.locator('[data-testid=player-speed]')).toHaveValue('1.5');
    const rate = await page.evaluate(() => document.querySelector('video').playbackRate);
    expect(rate).toBe(1.5);
  });

  test('CC button is hidden when no subtitle is available', async ({ page }) => {
    await loginAsAdmin(page);
    await openFirstCourse(page);
    // Without an .srt sidecar the API does not emit `subtitle` on the video,
    // so the prop is empty and the button is not rendered.
    await expect(page.locator('[data-testid=player-cc-toggle]')).toHaveCount(0);
  });
});
```

> If your test fixtures include a course with an `.srt` sibling, add a third test that toggles CC on, reloads, and asserts the toggle is still on. Skip otherwise.

- [ ] **Step 10.2: Run dockerized tests**

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

Expected: green.

- [ ] **Step 10.3: Commit**

```bash
git add frontend/tests/e2e/player-cc-and-speed.spec.js
git commit -m "test(e2e): playback speed persists across reload, CC hidden without sub"
```

---

### Task 11: Codex review

- [ ] **Step 11.1: Run codex on the diff**

```bash
git diff origin/main...HEAD > /tmp/pr-c-diff.txt
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task \
  "Review this Vue 3 player PR. Focus on: \
  (1) the resume-bug fix — do any code paths still race the parent's seek? \
  (2) localStorage reads on SSR (must be guarded with typeof window check), \
  (3) any case where the watcher on currentTime fires unboundedly, \
  (4) accessibility: aria-pressed on CC toggle, focus-visible on the speed dropdown. \
  Reply with HIGH/MEDIUM/LOW findings. Diff:\n\n$(head -c 200000 /tmp/pr-c-diff.txt)"
```

Expected: structured review.

- [ ] **Step 11.2: Apply HIGH-severity fixes if any, commit, re-run tests**

If codex flags HIGH findings, fix and commit `fix(pr-c): address codex review findings`. Otherwise skip.

---

### Task 12: Push and open the PR

- [ ] **Step 12.1: Push and open PR**

```bash
git push -u origin feat/player-correctness
gh pr create \
  --base main \
  --title "fix(player): resume bug, smart course-open, CC toggle, speed memory" \
  --body "$(cat <<'EOF'
## Summary
- **Headline fix**: a partially-watched video now resumes at the saved position (was always restarting from 0). Root cause was two competing loadedmetadata listeners; the parent now owns seeking via a real reactive prop.
- Opening a course auto-selects the next not-completed video at its saved position, with a "Start from beginning" link to override.
- CC toggle + WebVTT track wiring (subtitle file is auto-converted from .srt by PR-A's content endpoint).
- Playback speed persists across courses and reloads via localStorage (per browser).

## Test plan
- [x] Vitest unit suite green (new: smartOpen, playerPreferences)
- [x] Playwright e2e green (new: player-resume, player-cc-and-speed)
- [x] Manual smoke: real video, resume verified at saved position
- [x] Codex sweep clean

## Spec
docs/superpowers/specs/2026-05-04-pr-c-player-correctness.md
EOF
)"
```

- [ ] **Step 12.2: Update master tracker**

```bash
git add docs/superpowers/specs/2026-05-04-skillgoblin-feature-pack-overview.md
git commit -m "docs(tracker): PR-C complete"
git push
```

---

## Verification gate

- [ ] All new unit tests pass (smartOpen, playerPreferences)
- [ ] All new e2e tests pass (player-resume, player-cc-and-speed)
- [ ] Resume e2e specifically green (headline regression test)
- [ ] Full existing vitest + Playwright suites green
- [ ] Codex sweep: no HIGH findings open
- [ ] Manual visual smoke recorded
- [ ] No console errors when CC is toggled or speed changes
- [ ] Master tracker PR-C boxes ticked
