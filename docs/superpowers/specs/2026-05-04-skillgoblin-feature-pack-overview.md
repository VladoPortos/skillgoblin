# SkillGoblin Feature Pack — Overview & Tracker

**Date:** 2026-05-04
**Worktree:** `affectionate-rosalind-45f4d6`
**Branch:** `claude/affectionate-rosalind-45f4d6`
**Owner:** vladoportos

This doc is the master tracker for a four-PR feature pack. Each PR has its own spec
file in this directory. Edit the checkboxes here as work progresses so a future
session can pick up cleanly after a context clear.

---

## Goal

Improve SkillGoblin user and admin UX without adding social, chat, or
recommendation features. Make the content folder a more authoritative source of
truth, polish the admin edit flow, fix a real player-resume bug, and add basic
discovery for new content.

## Non-goals

- No chat, comments, ratings, sharing, or social activity.
- No recommendation engine, no analytics dashboards, no notifications.
- No changes to the auth/session model — that subsystem was just hardened.
- No new external dependencies unless absolutely required by a single PR.

---

## Feature catalog (final)

The original ten-feature menu was triaged with the user. Final scope:

| ID | Feature | Source | PR |
|----|---------|--------|----|
| F1 | `course.json` override + admin "Export to JSON" | user | A |
| F2 | Drag-and-drop thumbnail upload area | user | B |
| F3 | `.srt` sidecar auto-loading + CC toggle (per-user, localStorage) | claude | A (server) + C (UI toggle) |
| F4 | Resume bug fix + smart course-open (next not-completed video at saved position) | claude | C |
| F5 | Per-user playback speed memory (localStorage) | claude | C |
| F6 | Recently added sort + `NEW` badge | claude | D |

**Dropped after investigation:**

- Auto-play next lesson — already implemented in [pages/courses/[id].vue:358](../../../frontend/pages/courses/[id].vue) (`markAsCompleted` calls `playNextVideo`). No work needed.
- Keyboard shortcuts in player — user deprioritized.
- Manual mark watched/unwatched — VideoControlButtons already does this per video.
- Course-level private notes — user deprioritized.

---

## PR plan

| PR | Spec | Scope | Branch suggestion |
|----|------|-------|-------------------|
| A | [pr-a-content-source-of-truth](./2026-05-04-pr-a-content-source-of-truth.md) | F1 (course.json + export) + F3 server side (.srt detection & serving) | `feat/content-source-of-truth` |
| B | [pr-b-thumbnail-dropzone](./2026-05-04-pr-b-thumbnail-dropzone.md) | F2 (drag-drop thumbnail) | `feat/thumbnail-dropzone` |
| C | [pr-c-player-correctness](./2026-05-04-pr-c-player-correctness.md) | F4 (resume + smart open) + F3 UI (CC toggle) + F5 (speed memory) | `feat/player-correctness` |
| D | [pr-d-recently-added](./2026-05-04-pr-d-recently-added.md) | F6 (sort + NEW badge) | `feat/recently-added` |

**Merge order:** A → B → D → C (least player-state nuance first).

**Independence:** A↔B, A↔C, B↔C, B↔D, C↔D have zero file overlap. A and D both
touch `server/api/courses.js` but in different ways — easy to rebase.

**Soft dependency:** PR-C's CC toggle UI is functionally tied to PR-A's
`subtitle` payload field and `.vtt` conversion endpoint. PR-C still compiles and
its other features (resume fix, smart open, speed memory) work fine without
PR-A, but the CC button stays hidden until PR-A is in. The merge order respects
this.

---

## Verification gates (every PR)

Each PR is **not** marked complete until all of these pass:

1. **Vitest unit suite** — full suite green via the dockerized test stack.
2. **Playwright e2e suite** — full suite green via the dockerized test stack.
3. **New tests** — every PR adds unit and/or e2e tests covering its new behavior. PR-specific test counts live in each spec.
4. **Codex review** — invoked via direct Bash, not via the `codex:rescue` slash skill (which hangs in this environment per project memory). Required after substantial code changes.
5. **Manual visual smoke** — Playwright-driven screenshot or interactive walk through the new UX. Documented in the PR spec under "Manual sign-off."
6. **No regressions** — file-watcher rescan still works; existing course thumbnails still load; existing user progress still resumes.

### Codex invocation contract

Use the script directly. Never use `/codex:rescue` (it hangs).

```bash
node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task "<prompt>"
```

A short smoke probe was run during planning and returned `codex-ok`, so the
companion is reachable from this worktree.

### Test stack invocation

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

This is the only authoritative way to verify a PR — local `npm test` does not
match the dockerized environment used in CI.

---

## Cross-cutting decisions (locked)

These apply to all PRs unless overridden in a per-PR spec.

- **Subtitle preference (F3) and playback-speed memory (F5)** are stored in
  `localStorage` keyed by user id, not in the SQLite database. No new schema,
  no new API routes. If we ever want server-synced preferences, add later as a
  separate PR.
- **`course.json` (F1) precedence:** the JSON file overrides DB metadata at
  *scan time*. The admin edit modal continues to write directly to the DB. If a
  user edits a course in the admin modal **and** a `course.json` exists,
  the next scan will revert their edits unless they re-export. This is the
  desired tradeoff (folder == truth) and will be documented in the admin UI
  with a warning banner when a `course.json` is present.
- **`course.json` does not own the thumbnail.** The existing `thumbnail.png`
  convention stays exactly as is. JSON only carries text metadata
  (title, description, category, releaseDate).
- **Export JSON does not include the thumbnail blob** — keeps the file
  human-readable and small. The thumbnail is already a sidecar `thumbnail.png`.
- **`NEW` badge (F6) lookback** defaults to 7 days, configurable via env var
  `NEW_BADGE_DAYS` (no UI control — homelab op decides). 0 disables the badge.
- **Branch strategy:** all four PRs branch from `main`, not from each other.
  The current worktree (`claude/affectionate-rosalind-45f4d6`) is the staging
  area; we'll cut the four feature branches from `main` when each PR is ready.

---

## Master checklist

### Phase 0 — planning artifacts

- [x] Codex companion smoke-tested (`codex-ok` confirmed)
- [x] Resume-bug root cause located (two competing `loadedmetadata` listeners)
- [x] Auto-play next lesson confirmed already implemented (no work needed)
- [x] Worktree confirmed (`affectionate-rosalind-45f4d6`)
- [x] Overview tracker written (this file)
- [x] PR-A spec written
- [x] PR-B spec written
- [x] PR-C spec written
- [x] PR-D spec written
- [ ] User reviewed and approved all five files
- [ ] Per-PR implementation plans drafted via writing-plans skill (one per PR)

### Phase 1 — PR-A: Content folder as source of truth

See [pr-a-content-source-of-truth](./2026-05-04-pr-a-content-source-of-truth.md) for full spec.

- [ ] Branch `feat/content-source-of-truth` cut from `main`
- [ ] Scanner reads `course.json` and applies overrides
- [ ] Admin "Export JSON" endpoint (single course)
- [ ] Admin "Export JSON for all courses" endpoint
- [ ] AdminPanel UI surfaces both export actions
- [ ] `.srt` sidecar served by `/api/content/...`
- [ ] Frontend `<track>` element wired in `VideoPlayer.vue` (UI toggle lives in PR-C)
- [ ] New unit tests (course.json parsing, export shape, .srt resolution)
- [ ] New Playwright e2e covering export and override flow
- [ ] Full vitest + Playwright suite green
- [ ] Codex review pass clean
- [ ] Manual visual smoke documented
- [ ] PR opened, reviewed, merged

### Phase 2 — PR-B: Drag-and-drop thumbnail

See [pr-b-thumbnail-dropzone](./2026-05-04-pr-b-thumbnail-dropzone.md) for full spec.

- [ ] Branch `feat/thumbnail-dropzone` cut from `main`
- [ ] CourseEditor thumbnail block replaced with dropzone (click or drop)
- [ ] Drag-over visual state, drag-leave reset
- [ ] Same upload pipeline (no server change)
- [ ] Reject non-image files with inline error
- [ ] New Playwright e2e covering drag-drop and click-to-upload
- [ ] Full vitest + Playwright suite green
- [ ] Codex review pass clean
- [ ] Manual visual smoke documented
- [ ] PR opened, reviewed, merged

### Phase 3 — PR-D: Recently added discovery

See [pr-d-recently-added](./2026-05-04-pr-d-recently-added.md) for full spec.

- [ ] Branch `feat/recently-added` cut from `main`
- [ ] `/api/courses` accepts `sort=newest` and orders by `created_at DESC`
- [ ] CourseCard renders `NEW` badge when `created_at` is within `NEW_BADGE_DAYS`
- [ ] `NEW_BADGE_DAYS` env var documented in README
- [ ] Sort dropdown or tab in courses page
- [ ] New unit test for sort param
- [ ] New Playwright e2e covering newest sort and badge presence
- [ ] Full vitest + Playwright suite green
- [ ] Codex review pass clean
- [ ] Manual visual smoke documented
- [ ] PR opened, reviewed, merged

### Phase 4 — PR-C: Player correctness

See [pr-c-player-correctness](./2026-05-04-pr-c-player-correctness.md) for full spec.

- [ ] Branch `feat/player-correctness` cut from `main`
- [ ] `VideoPlayer.vue`: `currentTime` becomes a real reactive prop; internal `loadedmetadata` listener removed
- [ ] Resume bug verified fixed (partially-watched video resumes at saved position)
- [ ] Course-open auto-selects next not-completed video instead of always lesson 1, video 1
- [ ] CC toggle button wired in `VideoPlayer.vue`, persisted to localStorage per user
- [ ] Playback speed dropdown persisted to localStorage per user, rehydrated on player mount
- [ ] New unit tests (resume seek logic, next-not-completed selection, CC/speed persistence)
- [ ] New Playwright e2e covering resume, smart-open, CC toggle, speed memory
- [ ] Full vitest + Playwright suite green
- [ ] Codex review pass clean
- [ ] Manual visual smoke documented
- [ ] PR opened, reviewed, merged

### Phase 5 — sign-off

- [ ] All four PRs merged to `main`
- [ ] Final smoke test on `main`
- [ ] README updated where needed (env vars, course.json schema)
- [ ] CHANGELOG entry written

---

## Risk register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `course.json` overwrites admin edits silently | Medium | Banner in CourseEditor when JSON detected; user accepts the tradeoff |
| Player resume fix breaks an unrelated playback flow | Medium | New e2e tests cover all three flows: fresh-open, resume, completed-rewatch |
| Drop-zone breaks file-input flow on Safari/iOS | Low | Keep the file input as a fallback; dropzone wraps it |
| `NEW` badge looks ugly when many courses are recent | Low | Default 7 days; env var to tune; visual review |
| Test suite duration grows | Low | New tests are small and run inside the existing dockerized stack |

---

## Notes for future sessions

If you pick this up after a context clear:

1. Read this file and the four PR specs in `docs/superpowers/specs/2026-05-04-pr-*.md`.
2. Check the master checklist above to find the highest unchecked item.
3. Resume from there. Do **not** restart from scratch — every checked box is real, committed work.
4. To verify Codex still works: `node /c/Users/vlado/.claude/plugins/cache/openai-codex/codex/1.0.2/scripts/codex-companion.mjs task "Reply with codex-ok"`. Never invoke `/codex:rescue`.
5. Tests run only via `docker compose -f docker-compose.test.yml run --rm --build tests` — local Vitest is not authoritative.
