# SkillGoblin Targeted Hardening Design

## Goal

Fix the confirmed correctness, configuration, resource-lifecycle, and authorization defects without redesigning the application or invalidating existing user progress and course identifiers.

## Threat model

SkillGoblin runs on a trusted LAN for a small group. Course metadata, thumbnails, and media require an active user session, but the legacy credential-less account flow remains an anonymous first-claim workflow. Administrators can reset credentials after an incorrect claim. Internet-grade controls, external identity providers, and cross-process rate limiting are out of scope.

## Design

1. Add `requireAuth` to course listing, detail, categories, thumbnails, and content handlers. Remove course content and thumbnails from the session-middleware skip list. Authenticated media responses use private browser caching.
2. Preserve legacy first-claim recovery. Add explicit tests documenting that it is allowed only for active accounts with no stored credential and remains rate-limited.
3. Reconcile the filesystem on every startup instead of treating a non-empty database as proof that the index is current. Watch nested course changes and debounce rescans by top-level course directory.
4. Preserve existing course IDs. Detect a generated-ID collision with a different folder before updating the database and refuse the conflicting write.
5. Add a forward-only migration enforcing case-insensitive username uniqueness. The migration refuses to proceed if existing duplicates need operator resolution; it never deletes or merges users.
6. Replace the racy reusable file-handle cache with per-read handles closed in `finally`. Validate single HTTP byte ranges, including suffix ranges, and return 416 for invalid or unsupported ranges.
7. Honor documented environment aliases and forward bootstrap credentials through the development Compose file.

## Error handling and compatibility

- Authentication failures use the existing 401/403 H3 errors.
- Invalid ranges return 416 with `Content-Range: bytes */<size>`.
- Course ID collisions are logged and skipped without modifying the existing row.
- Existing IDs, progress JSON keys, sessions, and course data remain unchanged.
- Existing duplicate usernames block the uniqueness migration with an actionable error rather than causing data loss.

## Verification

Use Vitest for pure helpers, migrations, scanner decisions, collision checks, and range parsing. Use Playwright/API tests for anonymous course denial, authenticated course access, and the retained legacy first-claim flow. Run the complete unit suite, production build, and Dockerized e2e suite when the environment supports them.
