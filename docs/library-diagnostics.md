# Library indexing and media diagnostics

Open **Admin Panel → Diagnostics** to inspect the resolved content directory and database path, watcher polling interval, scan counters, missing-course count, and recent scan errors. Refresh reloads the current state. Only active administrators can access this endpoint or probe media.

Missing course folders are marked unavailable and omitted from catalog results and category counts. Their metadata, thumbnails, and user progress remain in SQLite. Restore the content mount/folder and rescan to make them available again. An empty content mount does not delete saved progress. A missing content root marks all indexed courses unavailable and records the failed scan. Other filesystem failures record an error without deleting records.

Scans preserve the latest database metadata unless an operator explicitly requests a metadata reset. Fields pinned in `course.json` continue to take precedence. Full scans and filesystem changes share a serial queue; duplicate full-scan requests join the running scan. File events are debounced by course. Shutdown closes watchers, clears timers, and drains the current operation.

The diagnostics course selector displays at most 100 courses, listing unavailable courses first. The course-ID field supports inspecting other courses. The video number uses the indexed lesson/video order and starts at 1. Inspection checks up to the first 100 file paths and probes only the selected video. The result names the codecs and container, reports missing files and missing ffprobe, and explains browser compatibility. It does not transcode or modify media.

Each ffprobe process has a 10-second timeout and bounded output. Frame thumbnail extraction has a 15-second ffmpeg timeout, an 8 MiB image limit, and bounded error output. One diagnostics probe may run at a time across the server. Scan error history retains the latest 100 entries with limited message sizes in memory; it resets on restart. The diagnostics UI intentionally does not expose environment secrets.

Catalog responses retain pagination and category counts but use stored metadata and video summaries instead of parsing every lesson tree. Items include `videoCount` and `videoIds`; full lessons remain available from the course detail endpoint. Video summaries are rebuilt during migration and indexing.
