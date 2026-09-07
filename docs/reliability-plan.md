# Reliability and recovery implementation

Scope: implement all findings in the September review and selected features 1, 3, 4, 5, 6. Preserve SQLite, existing styling, deployment simplicity, and user data. No deployment or real-data migration during development.

## Design and acceptance

- Stable video IDs derive from relative filenames, independent of ordering. A forward migration rewrites legacy progress using the last indexed course tree before rescanning. Old API snapshots must not overwrite newer state: add per-course revisions, 409 conflicts, and a client save queue that merges only changed keys, displays failures, retries, and preserves pending work locally.
- Authentication compares verified credentials with current state immediately before issuing sessions. Credential resets and kicks invalidate upgrade tokens. Request limits are endpoint-specific with total multipart limits.
- Operator CLI supports consistent SQLite backups, offline validated restore with a safety backup, and interactive password reset inside Docker. Database aliases resolve at runtime. Documentation supplies complete Docker commands and explains backup scope and storage permissions.
- Scanner marks absent courses unavailable, retains metadata/progress, merges current metadata at write time, coordinates scan requests, closes watchers and bounded subprocesses, and exposes bounded diagnostic history. Catalog queries exclude unavailable courses and return summary data with shared progress summaries.
- Media diagnostics use bounded ffprobe and explain codecs/missing files without transcoding. Admin diagnostics UI shows configuration, scan errors and media results. Preserve existing design tokens and use accessible controls.
- Remove ineffective prefetch. Align Node versions. CI runs locked dependencies and tests, publishes amd64/arm64 immutable SHA tags, and promotes a specified digest after verification.

## Work packages

- [x] Security and operator tooling: regression tests, auth/body fixes, CLI, backup/restore/recovery docs, runtime paths.
- [x] Progress integrity: stable IDs/migration, CAS API, save queue/conflict/retry UI, migration/concurrency tests.
- [x] Indexing and diagnostics: unavailable retention, latest-metadata writes, serialized watcher/scan, bounded media tools, diagnostics API/UI, catalog query simplification.
- [x] Deployment: Node/ARM64/tests/digest promotion, ineffective prefetch removal.
- [x] Integration: run unit suite, clean build, isolated browser scenarios, inspect diff, independent final review, correct all actionable findings.

Decisions: feature 2 scan preview is not requested; missing-course retention is still required to fix destructive empty-mount cleanup. Backup media separately; the CLI backs up the database containing profiles, progress, metadata and thumbnails. Restore is explicitly offline. No passwords in command arguments/logs. Preserve original checkout data and untracked review.


Validation: final production Docker build passed; 283 unit tests across 39 files and all 139 Chromium tests passed. Diagnostics UI inspected. Workflow syntax and operator native dependency/CLI smoke checks passed. Hosted ARM64 execution and registry publication were not performed. Isolated test volumes were removed; original data and tracked fixtures were preserved.
