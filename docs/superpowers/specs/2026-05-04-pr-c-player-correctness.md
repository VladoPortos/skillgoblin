# PR-C — Player correctness

**Parent:** [feature pack overview](./2026-05-04-skillgoblin-feature-pack-overview.md)
**Branch:** `feat/player-correctness`
**Scope:** F4 (resume bug fix + smart course-open) + F3 UI (CC toggle) + F5 (playback speed memory)

---

## Goal

Fix a real video resume bug, make opening a course do the right thing for
returning users, and add two persisted player preferences (subtitles on/off,
playback speed). All three live in the same surface area
([VideoPlayer.vue](../../../frontend/components/video/VideoPlayer.vue) and
[pages/courses/[id].vue](../../../frontend/pages/courses/[id].vue)) so they
ship together.

## Non-goals

- No keyboard shortcut wiring (user deprioritized).
- No countdown overlay before the next video — auto-play next is already implemented and the user is happy with current behavior.
- No server-synced preferences — speed and CC are localStorage only.
- No support for multiple subtitle tracks per video (one .srt sibling = one track).

## Cross-PR dependency

The CC toggle (F3 UI) is **functionally dependent on PR-A** landing first.
PR-A's server work adds the `subtitle` field to the course payload and the
`/api/content/.../*.vtt` conversion endpoint. Without PR-A, `currentVideo.subtitle`
is always undefined, so the CC button stays hidden — the code does not break, but
the feature is dead. The merge order in the overview (A → B → D → C) handles this.

The resume bug fix and smart course-open (F4) and playback speed memory (F5) have
no PR dependencies and could land first if priorities change.

---

## Approach

### F4.a — Fix the resume bug

**Bug:** Clicking a partially-watched video restarts at 0 instead of saved position.

**Root cause:** Two `loadedmetadata` listeners race:

- [`VideoPlayer.vue:57-72`](../../../frontend/components/video/VideoPlayer.vue) registers an internal `{once: true}` listener inside the `watch(src, ...)` callback. It sets `currentTime = props.currentTime` (always 0 because the parent never passes the prop).
- [`pages/courses/[id].vue:25`](../../../frontend/pages/courses/[id].vue) emits the same event upward to `handleVideoLoaded` which seeks to the saved position.

Both fire on `loadedmetadata`. The internal listener was added later (inside the watch handler), so in Chromium it runs after the Vue template binding — the parent's seek is overwritten with 0.

**Fix:** Make the parent the single source of truth for seek position.

1. In `pages/courses/[id].vue`, add a reactive `currentTimeForPlayer` ref that
   parent computes when it switches videos. Pass it down as the
   `currentTime` prop to `VideoPlayer`.
2. In `VideoPlayer.vue`, remove the internal `addEventListener('loadedmetadata', ...)`
   that mutates `currentTime`. Add a single watcher on `props.currentTime` that
   seeks the player when the value changes (debounced via the
   `loadedmetadata` event the parent already listens to).
3. The parent's `handleVideoLoaded` keeps doing what it does today (seek based on `videoProgress[currentVideoId]`), but is now the only seeker.

That's the minimum fix. The watcher on `currentTime` makes it possible for
PR-C's "smart open" logic to seek without depending on the loadedmetadata race.

**Concrete unit test:** open a course with a saved progress of 50% on lesson 2 video 3, click that video, assert `videoPlayer.getCurrentTime()` is non-zero after the seek event fires (use `waitFor` with a 500ms budget).

### F4.b — Smart course-open

Today, opening a course always selects lesson 1 video 1 (see
[`watch(course, ...)`](../../../frontend/pages/courses/[id].vue) at line 215).
After F4.a's fix, the saved-position seek works, but the user still has to
click around to find where they left off.

**New behavior:** when the course mounts and the user has saved progress,
auto-select the first **not-completed** video in lesson order, with seek
position preloaded.

Algorithm:

1. Wait for both `course` and `progressData` to be loaded.
2. If no progress exists for this user/course → keep current behavior (select lesson 1, video 1, time 0).
3. Else, walk `course.lessons[].videos[]` in order. For each `videoId = ${lessonId}-${index}`:
   - If `completedVideos[videoId]` is true → skip.
   - Else if `videoProgress[videoId] > 0` → select this video, set `currentTimeForPlayer` to `(videoProgress[videoId] / 100) * duration`. Done.
   - Else → select this video, set `currentTimeForPlayer = 0`. Done.
4. If every video is completed → select last video, time 0 (course is done; stay where they were).

Add a "Start from beginning" link below the player to override smart-open. The
link resets to lesson 1, video 1, time 0 without altering saved progress.

**Why not auto-play?** Because the existing UX selects-but-pauses on initial
load. We preserve that — the user clicks play. Smart-open just changes which
video is pre-loaded.

### F3.b (UI) — CC toggle

PR-A's server work exposes `currentVideo.subtitle` (filename) and serves the
`.vtt` conversion. PR-C wires the player UI:

1. In `VideoPlayer.vue`, when `props.subtitleSrc` is non-empty, render a
   `<track kind="subtitles" :src="subtitleSrc" :default="ccDefault" srclang="en" />`. Treat the file as English by default — no language detection.
2. Add a CC button overlayed on the player (or to the right of the speed
   dropdown — visible only when subtitles are available).
3. CC state stored in `localStorage.setItem('skillgoblin:cc:default', '1' | '0')`,
   read once on mount and applied via `track.mode = 'showing' | 'hidden'`.
4. Toggle updates both the localStorage value and the live track mode.

Storage key is per-browser, not per-user — localStorage is already a per-user
proxy (each named user has their own browser profile in a typical homelab).
Document this as a known tradeoff.

### F5 — Playback speed memory

A speed dropdown next to the CC button (always visible, not gated on
subtitles): `0.5×, 0.75×, 1×, 1.25×, 1.5×, 1.75×, 2×`. Default is 1×.

- Store the selected speed in `localStorage.setItem('skillgoblin:playbackRate', '1.5')`.
- On player mount, read the stored value (or 1× default), set `video.playbackRate`.
- On change, write the new value and apply it to the live `<video>` element.

The dropdown lives in `VideoPlayer.vue` so it's always visible, regardless of
which course is open.

---

## Files changed

### Modified

- `frontend/components/video/VideoPlayer.vue`
  - Make `currentTime` a reactive prop with a watcher that seeks
  - Remove the internal `loadedmetadata` listener
  - Add `subtitleSrc` prop and `<track>` element
  - Add CC button (visible when `subtitleSrc` truthy)
  - Add speed dropdown
  - Read/write localStorage for CC and speed
- `frontend/pages/courses/[id].vue`
  - Add `currentTimeForPlayer` ref, pass to VideoPlayer as `currentTime`
  - Replace the `watch(course, ...)` first-video-selection logic with smart-open
  - Compute `subtitleSrc` from `currentVideo.subtitle` (PR-A's payload field)
  - Add "Start from beginning" link below player
- `frontend/components/video/VideoControlButtons.vue` — no change expected, but verify still aligned

### Added

- `frontend/tests/unit/smartOpen.test.js` — pure unit test of the next-not-completed selection algorithm
- `frontend/tests/unit/playerPreferences.test.js` — unit tests for localStorage helpers
- `frontend/tests/e2e/player-resume.spec.js`
- `frontend/tests/e2e/player-cc-and-speed.spec.js`

No server files. No schema changes.

---

## Test plan

### Unit tests

1. `smartOpen` selects lesson 1 video 1 when no progress exists.
2. `smartOpen` selects lesson 2 video 3 when 1.1 and 2.1, 2.2 are completed and 2.3 has 30% progress; returned `seekRatio` is 0.3.
3. `smartOpen` selects last video when every video is completed.
4. `smartOpen` skips fully-completed videos even if they have non-zero `videoProgress`.
5. `playerPreferences.getCcDefault()` returns `false` when key is missing.
6. `playerPreferences.setPlaybackRate(1.5)` writes the string '1.5'.
7. `playerPreferences.getPlaybackRate()` returns 1 when value is missing or invalid.

### E2E tests (Playwright)

1. **Resume bug regression test**: load a course, play video 2 to ~50%, navigate away, navigate back — verify the player resumes at 50% (not 0).
2. **Smart open**: course has video 1.1 completed and video 1.2 at 30% progress. Open the course → video 1.2 is preselected and the player time-displays ~30% of duration.
3. **Start from beginning**: smart-open selects video 1.2 → user clicks "Start from beginning" → video 1.1 selected, time 0, no DB change.
4. **CC toggle persistence**: load a video with .srt sidecar, toggle CC on, reload → CC stays on. Toggle off, reload → off.
5. **CC button hidden**: load a video without a sidecar → CC button is not rendered.
6. **Speed memory**: set 1.5×, navigate to a different course, verify speed is still 1.5×. Open in a new tab, same browser → still 1.5×.
7. **Speed reset on logout-login**: same browser, but log out and log in as a different user → speed is whatever the new user last set (still localStorage-scoped per browser; document as expected).

### Manual sign-off

- Hand-check the resume fix on a real video that lasts more than 60 seconds.
- Confirm CC button only appears when a `.srt` exists in the course folder.
- Confirm speed dropdown updates the `<video>` element's `playbackRate` immediately, not only on next play.

---

## Edge cases

- **`currentTime` prop changes while the video is mid-load**: the watcher debounces by waiting for `loadedmetadata` if `readyState < 1`.
- **Saved progress is 100%** (a quirk of the existing code): treat as completed; skip in smart-open.
- **Saved `playbackRate` is invalid** (e.g., user manually edited localStorage): fall back to 1×, log warning, do not crash.
- **Subtitle track exists but the .vtt endpoint fails**: hide the CC button gracefully; do not surface a broken `<track>`.
- **Multiple tabs open the same course**: speed and CC are global localStorage; tabs share. Acceptable.
- **Resume after a video file was renamed in the folder** (so `videoProgress[oldId]` references a non-existent video): smart-open finds nothing for that id, falls through to the next not-completed video.

---

## Verification gate

- [ ] All new unit tests pass
- [ ] All new e2e tests pass (Chromium, Firefox, Webkit)
- [ ] Full existing vitest suite green
- [ ] Full existing Playwright suite green
- [ ] Resume bug regression test specifically green (this is the headline fix)
- [ ] Codex review on changed files: no HIGH severity findings
- [ ] Manual visual smoke recorded
- [ ] No console errors when CC is toggled or speed changes
