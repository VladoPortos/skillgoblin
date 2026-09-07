# Progress saves and upgrades

The player shows whether progress is saved, pending, saving, or could not be saved. Failed saves retry automatically; **Retry now** retries immediately. Pending edits are also stored in the current browser when local storage is available. If browser storage is unavailable, a separate warning explains that closing the page may lose unsaved work. Keep the page open until it reports **Progress saved**. Logout waits for a successful save.

Each course has a progress revision. A stale device fetches the latest revision and reapplies only its changed completion, playback, favorite, and last-viewed fields. Unrelated changes from another device survive. When both devices change the same field, the retrying device's change wins. This is conflict handling, not a history or undo feature.

Take a [database backup](operations.md) before upgrading. Migration 006 assigns video IDs from relative lesson folder and filename and translates positional progress using the last indexed course tree before startup scanning. Inserting or reordering videos no longer shifts completion to another file. Renaming or moving a video changes its identity; there is no automatic rename matching. Unknown historical progress is retained but is not counted against current videos. Reload older open browser tabs after upgrading.

API clients must GET `/api/user-progress/USER_ID` and use `revisions[COURSE_ID]` (default `0`) as the `revision` in each POST alongside `courseId` and `data`. A missing revision returns 428; a stale revision returns 409. Read the current state and merge intended changes before retrying. GET does not delete historical progress or scan the filesystem.

The library's All view retrieves paginated course summaries and progress for the visible course IDs. Favorites and In Progress load when their tabs are selected. Missing course directories are hidden from the library while their metadata and progress remain in SQLite; restoring the same directory makes them available again after scanning.
