# SkillGoblin — architecture map (main branch, current state)

Working reference. Purpose: know what's there, what depends on what, and what will break if we change it. Especially scoped to the upcoming auth/session rewrite, but covers the whole app.

All file paths are relative to repo root. All citations are file:line.

> **Snapshot date:** captured against `main` before the auth-hardening PR. Items in §10 marked "delete" have been removed on the `feat/auth-hardening` branch as part of Phase 0; the dead `DELETE` branch in `frontend/server/api/users/index.js` was also stripped. The map otherwise still describes `main` accurately and is the right reference document for planning subsequent phases.

---

## 0. The 60-second cheat sheet

- **Stack:** Nuxt 3 (SSR disabled — pure SPA), Tailwind 3, better-sqlite3, Vue 3 composition API.
- **Persistence:** one SQLite file at `/app/data/database/database.sqlite` (in-container). Single writer, singleton connection.
- **Content:** course folders live at `/app/data/content/` on the host, mounted into the container. A file watcher (`chokidar`, polling) syncs folder structure into the `courses` table.
- **Auth today:** zero. There is no server-issued session. "Logged in" means *the browser has a `userId` UUID in `localStorage`*. Server endpoints accept that ID from the client and trust it. Passwords/PINs are stored and compared as plaintext. There is no JWT, no cookie, no token, no rate limit.
- **Hardcoded container path:** `/app/data/content` is baked into the source via `path.resolve(process.cwd(), '/app/data/content')` (which always resolves to `/app/data/content` regardless of cwd — see [frontend/server/utils/courseHelpers.js:4](frontend/server/utils/courseHelpers.js:4) and [frontend/server/api/user-progress/[userId].js:34](frontend/server/api/user-progress/[userId].js:34)). The app cannot run outside a Docker container with that exact mount point without code changes.
- **Dead code in tree:** `/api/progress` and `/api/favorites` reference columns/tables that don't exist in the DB schema and are not called by anything in the frontend. They would throw if hit. See §10.
- **Inactive route stubs:** `/api/users/[id]` PUT and DELETE methods are placeholder comments inside an `if` block — they return 405 Method Not Allowed (see [frontend/server/api/users/[id].js:46](frontend/server/api/users/[id].js:46)). The actually-used delete path is the separate file `[id].delete.js`. The actually-used update path is PUT on the index route `/api/users`.

---

## 1. Top-level layout

```
.
├── docker-compose.yml          # dev (mounts repo + ./data)
├── docker-compose.prod.yml     # prod (builds Dockerfile.prod, mounts ./data/database + ./data/content)
├── Dockerfile.prod             # multi-stage: builder (nuxt build) + runtime (node .output/server/index.mjs)
├── README.md
└── frontend/                   # Nuxt app
    ├── nuxt.config.js
    ├── tailwind.config.js
    ├── package.json
    ├── pages/                  # 3 pages
    ├── components/             # 15 components
    ├── composables/            # 3 composables
    ├── plugins/                # 1 plugin (auth)
    ├── middleware/             # 1 middleware (auth)
    ├── public/                 # static assets
    └── server/
        ├── api/                # ~22 endpoints
        ├── middleware/         # 1 server middleware (cache-control)
        └── utils/              # db, course pipeline, helpers
```

### Runtime model
- Nuxt SSR is **disabled** ([frontend/nuxt.config.js:8](frontend/nuxt.config.js:8) `ssr: false`). The server only emits the SPA shell + serves API routes; rendering is 100% client-side.
- Nitro `serverHandlers` is empty; all server logic is auto-discovered from `server/api/`.
- One server-middleware ([frontend/server/middleware/cache-control.js](frontend/server/middleware/cache-control.js)) sets `Cache-Control: no-cache` on HTML responses.
- Route rules ([frontend/nuxt.config.js:11-35](frontend/nuxt.config.js:11)):
  - `/content/**` → `static: true` + `Accept-Ranges: bytes` (intended for direct static streaming, but in practice content is served via `/api/content/[...path]`).
  - `/api/**` → `no-cache, no-store, must-revalidate`.
  - `/**` (catch-all HTML) → also `no-cache`.

---

## 2. Database schema (canonical, from [frontend/server/utils/db.js](frontend/server/utils/db.js))

Four tables defined in `CREATE TABLE IF NOT EXISTS`:

### `users`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | TEXT PRIMARY KEY | — | UUID |
| `name` | TEXT NOT NULL | — | display name |
| `avatar` | TEXT | NULL | JSON-stringified Beanhead config |
| `theme` | TEXT | `'dark'` | `'dark'` or `'light'` |
| `password` | TEXT | NULL | **plaintext** |
| `pin` | TEXT | NULL | **plaintext** numeric pin |
| `use_auth` | INTEGER | `0` | `1` if any credential check is required |
| `isAdmin` | INTEGER | `0` | role flag |
| `created_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | |

### `user_progress`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | — | |
| `user_id` | TEXT NOT NULL | — | **no FK declared**, but cleanup happens on user delete |
| `progress` | TEXT | `'{}'` | **JSON blob**, see shape below |
| `updated_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | |
| | | | `UNIQUE(user_id)` — one row per user |

JSON shape inside `progress` (the real source of truth for everything per-course/per-video):
```json
{
  "<courseId>": {
    "completed":   { "<lessonId-videoIndex>": true, ... },
    "progress":    { "<lessonId-videoIndex>": 0..100, ... },
    "favorite":    true,
    "lastViewed":  { "lessonId": "...", "videoIndex": 0 }
  },
  ...
}
```

### `courses`
| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | TEXT PRIMARY KEY | — | slug from folder name (`generateCourseId`) |
| `title` | TEXT NOT NULL | — | |
| `description` | TEXT | NULL | |
| `folder_name` | TEXT NOT NULL | — | actual on-disk folder under `/app/data/content/` |
| `thumbnail` | TEXT | NULL | always the literal string `'thumbnail.png'` for generated courses |
| `thumbnail_data` | BLOB | NULL | actual PNG bytes; **added via runtime ALTER** if missing — only column with a real migration |
| `category` | TEXT | `'Uncategorized'` | |
| `release_date` | TEXT | NULL | |
| `data` | TEXT NOT NULL | — | JSON-stringified full course object (lessons, videos, etc.) |
| `created_at` / `updated_at` | TIMESTAMP | `CURRENT_TIMESTAMP` | |

### `settings`
- `(id, user_id, key, value, created_at, updated_at)`, `UNIQUE(user_id, key)`, FK on `user_id` with `ON DELETE CASCADE`.
- **Created but unused.** The only code that touches it is the user-delete cleanup in `delete.post.js`. No frontend code calls `/api/settings`.

### Tables referenced in code but **never created**
- **`user_favorites`** — referenced by [frontend/server/api/favorites.js:16,40,43](frontend/server/api/favorites.js:16) and [frontend/server/api/users/[id].delete.js:35](frontend/server/api/users/[id].delete.js:35). Hitting any of those would throw `no such table: user_favorites`.

### Migration discipline
- Only `thumbnail_data` has a real `ALTER TABLE` migration ([frontend/server/utils/db.js:75](frontend/server/utils/db.js:75)).
- Everything else relies on `CREATE TABLE IF NOT EXISTS`, which means **adding a column to an existing table won't apply to upgraded installs**. Same hazard the PR ran into.

---

## 3. Server endpoints — full table

Auth column: `none` means anyone with HTTP access can call it. There are no other states today.

### Users
| Path | Methods | Auth | Mutation? | Status |
|---|---|---|---|---|
| `/api/users` | GET / POST / PUT / DELETE | none | yes (POST/PUT/DELETE) | live |
| `/api/users/[id]` | GET (`[id].js`) | none | no | live |
| `/api/users/[id]` | DELETE (`[id].delete.js`) | none | yes — also tries to DELETE from non-existent `user_favorites` ⚠️ | **partially broken** |
| `/api/users/delete` | POST (`delete.post.js`) | none | yes — used by `useSession.deleteAccount()` | live |
| `/api/users/auth` | POST | none | no | live (plaintext compare) |
| `/api/users/theme` | GET / POST | none | yes | live |

Notes:
- The PUT/DELETE branches in [frontend/server/api/users/[id].js:46-54](frontend/server/api/users/[id].js:46) are placeholders containing only `// Existing PUT implementation...` comments and fall through to the 405 at the bottom.
- Two delete paths exist (`[id].delete.js` and `delete.post.js`). Frontend uses `delete.post.js` via `useSession.deleteAccount()`. The `[id].delete.js` path is unreachable from the UI today and would throw on the `user_favorites` query.
- `users/[id].js` GET intentionally returns `has_password` / `has_pin` flags (not the values) — used by the login flow to decide whether to show the password or PIN modal.

### Progress / favorites (the real path)
| Path | Methods | Auth | Mutation? | Status |
|---|---|---|---|---|
| `/api/user-progress/[userId]` | GET / POST | none | yes (POST) — writes JSON blob | live, primary |
| `/api/user-progress-courses/[id]` | GET | none | no | live |
| `/api/user-favorites/[id]` | GET | none | no | live (reads `favorite` flag from JSON blob) |

### Progress / favorites (dead code)
| Path | Methods | Status | Why dead |
|---|---|---|---|
| `/api/progress` | GET / POST | **dead** | queries `course_id, lesson_id, video_index, completed, last_position` columns that don't exist in `user_progress`; also `parseInt(userId)` would NaN on UUIDs |
| `/api/favorites` | GET / POST | **dead** | queries non-existent `user_favorites` table; also `parseInt(userId)` |

Grep confirms zero callers in `frontend/` for either of these. Safe to delete in a cleanup pass.

### Courses / content
| Path | Methods | Auth | Mutation? | Notes |
|---|---|---|---|---|
| `/api/courses` | GET / POST | none | yes (POST refresh/rescan) | paginated listing + filters |
| `/api/courses/[id]` | GET / POST | none | yes (POST refresh/update) | single course; falls back to FS scan if not in DB |
| `/api/courses/edit` | POST (multipart) | **soft check**: requires `x-user-id` header pointing to a row with `isAdmin=1` ([courses/edit.js:9-30](frontend/server/api/courses/edit.js:9)) | yes — writes BLOB + thumbnail.png | only endpoint with any auth gate; trivially spoofable since headers are client-set |
| `/api/courses/rescan` | POST | none | yes — triggers full scan | |
| `/api/courses/[id]/list-files` | GET | none | no | |
| `/api/courses/[id]/download-file` | GET | none | no — streams arbitrary file from course folder | |
| `/api/content/[...path]` | GET | none | no | the streaming endpoint; HTTP 206 byte ranges, on-disk reads, in-memory chunk + thumbnail caches |
| `/api/course-thumbnail/[id]` | GET | none | no | alternative thumbnail-only endpoint |
| `/api/categories` | GET | none | no | parses every course's `data` JSON each call (O(n)) |
| `/api/random-banner` | GET | none | no | scans `public/banners/` |
| `/api/status/scan` | GET | none | no | snapshot of the in-memory `initialScanStatus` |
| `/api/settings` | GET / POST / DELETE | none | yes | live but **no callers** in frontend |

### Caching & streaming behavior in `/api/content/[...path]`
Code: [frontend/server/api/content/[...path].js](frontend/server/api/content/[...path].js).
- File-handle cache: 30 entries, 1 min TTL ([:8-10](frontend/server/api/content/[...path].js:8)).
- Chunk cache: 100 entries × up to 512KB, 5 min TTL ([:14-17](frontend/server/api/content/[...path].js:14)).
- Thumbnail cache: 50 entries, 10 min TTL ([:20-22](frontend/server/api/content/[...path].js:20)).
- Background eviction every 30s ([:25-49](frontend/server/api/content/[...path].js:25)).
- Range requests clamped to 2 MB max chunk; HTTP 206 with `Content-Range` ([:374-393](frontend/server/api/content/[...path].js:374)).
- Async prefetch of the next chunk after each range response ([:132-145](frontend/server/api/content/[...path].js:132)).
- This endpoint is the **only path video bytes ever travel through**. Anything that auth-gates it must keep byte ranges working (i.e. cookies pass through fine; bearer headers in `<video src=...>` requests do not — relevant for the rewrite).

---

## 4. Course content pipeline

Files: [frontend/server/utils/courseGenerator.js](frontend/server/utils/courseGenerator.js), [courseWatcher.js](frontend/server/utils/courseWatcher.js), [courseDatabase.js](frontend/server/utils/courseDatabase.js), [fileScanner.js](frontend/server/utils/fileScanner.js), [thumbnailUtils.js](frontend/server/utils/thumbnailUtils.js), [courseHelpers.js](frontend/server/utils/courseHelpers.js).

### Boot sequence
1. Nuxt server starts → Nitro loads `server/utils/db.js` (singleton DB connection + schema init) on first import.
2. `courseWatcher.js` runs `scanCoursesOnStartup()` at module load ([:405](frontend/server/utils/courseWatcher.js:405)).
3. After scan, `setupFileWatcher()` arms chokidar at `/app/data/content/` ([:356-402](frontend/server/utils/courseWatcher.js:356)) — top-level (depth 0), with polling at `CHOKIDAR_POLLING_INTERVAL` ms (default 60_000).
4. Watcher events: `addDir` → process new course; `unlinkDir` → remove. Sync only — no debounce.
5. `initialScanStatus` is a module-level object polled by [/api/status/scan](frontend/server/api/status/scan.js) and the courses page until `isComplete` flips ([pages/courses/index.vue:654-696](frontend/pages/courses/index.vue:654)).

### Course generation
- `generateCourseJson(folderName, fullPath)` → reads dir structure, builds `{ id, title, description, thumbnail: 'thumbnail.png', category, releaseDate, lessons: [{ id, title, folder, videos: [{ title, file }] }], lastUpdate }`.
- ID = lowercase + strip non-`[a-z0-9\s-]` + collapse spaces/dashes (`generateCourseId` in [courseHelpers.js:6](frontend/server/utils/courseHelpers.js:6)). **Collision-prone** for similarly-named folders.
- Subtitle support, language detection, README per lesson — **not present on main**. (Those are PR #5 features.)

### Thumbnail sync
- 4-way state machine in `synchronizeCourseThumbnail()` ([courseWatcher.js:24-80](frontend/server/utils/courseWatcher.js:24)) handling DB-vs-FS presence cross-product. DB wins on display when both exist.

---

## 5. Frontend

### Pages (`frontend/pages/`)
| Path | Route | Middleware | Auth modal | Fetches |
|---|---|---|---|---|
| `index.vue` | `/` | none | yes (in-page) | `GET /api/users`, `GET /api/random-banner`, `GET /api/users/[id]` (when picking), `POST /api/users/auth` |
| `courses/index.vue` | `/courses` | `auth` | — | `GET /api/courses`, `GET /api/categories`, `GET /api/user-progress/[id]`, `GET /api/user-favorites/[id]`, `GET /api/user-progress-courses/[id]`, `GET /api/status/scan`, plus admin-only `POST /api/courses/edit`, `POST /api/courses/rescan` |
| `courses/[id].vue` | `/courses/:id` | `auth` | — | `GET /api/courses/[id]`, `GET /api/user-progress/[userId]`, `POST /api/user-progress/[userId]`, `GET /api/courses/[id]/list-files`, video bytes via `/api/content/...` |

### Components (`frontend/components/`)
- **video/**: `VideoPlayer.vue` (raw `<video>` with native controls + exposed `play/pause/setCurrentTime/getCurrentTime/getDuration`), `VideoInfo.vue`, `VideoControlButtons.vue`.
- **course/**: `CourseCard.vue` (grid card; thumbnail = `/api/course-thumbnail/[id]?t=cacheBuster`), `CourseHeader.vue` (course detail page header).
- **filters/**: `CategoryFilterBar.vue`.
- **ui/**: `SearchBar.vue`, `TabNavigation.vue`, `ConfirmationModal.vue` (default slot used for the rescan "preserve metadata" checkbox).
- Top level: `AvatarSelector.vue` (Beanhead avatar editor), `CourseEditor.vue`, `CourseFilesModal.vue`, `ThemeToggle.vue`, `UserManagement.vue`, `UserProfile.vue`.

### Composables (`frontend/composables/`)
- **`useSession.js`** — current "auth" home base.
  - State: `userId`, `userName`, `userAvatar`, `isAuthenticated`, `useAuth`, `isAdmin` (all `useState` keys; an additional `user` computed object).
  - `setUser(user)` → mirrors object into state and writes `localStorage.userId` ([:31](frontend/composables/useSession.js:31)).
  - `login(id, authData?)` → fetches user, optionally calls `/api/users/auth`, then `setUser(...)`. Returns `{success}` shape.
  - `checkAuth()` → reads `localStorage.userId`, fetches the user, sets state. **No credential re-check on session restore** — knowing any user's UUID = "logged in".
  - `logout()` → clears state + `localStorage.userId`, navigates to `/`.
  - `updateUserSettings(settings)` → PUT `/api/users`.
  - `deleteAccount()` → POST `/api/users/delete`, then logout.
- **`useUserManagement.js`** — drives the login screen + create-user modal. Owns its own `users`, `selectedUser`, modals, PIN buffer, etc. Calls into `useSession.login` after credential entry.
- **`useTheme.js`** — `isDark` flag + `localStorage.theme` + DB roundtrip via `/api/users/theme` after login. Adds/removes `dark` class on `documentElement`.

### Plugins / middleware
- [frontend/plugins/auth.js](frontend/plugins/auth.js) — runs once on app boot, calls `useSession.checkAuth()`.
- [frontend/middleware/auth.js](frontend/middleware/auth.js) — route guard; checks `isAuthenticated.value`; redirects non-auth'd traffic away from anything that isn't `/`. Applied via `definePageMeta({ middleware: ['auth'] })` on `/courses` and `/courses/:id`.

---

## 6. End-to-end data flows

### Login (no-auth user)
```
User clicks card on /  →  useUserManagement.selectUser(user)
                       →  user.use_auth === 0
                       →  useSession.login(user.id)
                          →  $fetch /api/users/[id]
                          →  setUser() → localStorage.userId
                       →  router.push('/courses')
```

### Login (auth user, password OR pin)
```
User clicks card  →  useUserManagement.selectUser(user)
                  →  $fetch /api/users/[id]   // get has_password / has_pin
                  →  showAuthModal = true
                  →  user types pwd or pin
                  →  authenticateUser() → useSession.login(id, {password|pin})
                                       →  POST /api/users/auth {userId, password|pin}
                                       →  on {success:true} → setUser() → localStorage.userId
                  →  router.push('/courses')
```
**Risk:** the server returns only `{success:true}`. There is no token. The next request to any other endpoint trusts whatever `userId` the client sends — no link to the auth result.

### Session restore (page reload)
```
plugins/auth.js  →  useSession.checkAuth()
                 →  read localStorage.userId
                 →  $fetch /api/users/[id]
                 →  setUser(user)
                 →  isAuthenticated = true
```
**No credential re-check.** Anyone who can write `localStorage.userId = '<any uuid>'` in DevTools is "logged in" as that user, password or not.

### Watching a video
```
/courses/[id] mount  →  $fetch /api/courses/[id]            // course meta
                     →  $fetch /api/user-progress/[userId]  // progress JSON blob
                     →  auto-select first lesson + first video
<video> element src = /api/content/<courseId>/<lessonFolder>/<file.mp4>
                     →  byte-range GETs to /api/content/...
on timeupdate        →  POST /api/user-progress/[userId] {courseId, data:{...}}
on ended             →  mark completed, advance to next, save
```
- Progress saves are POSTs on every `timeupdate` event ([pages/courses/[id].vue:321-333](frontend/pages/courses/[id].vue:321), [:439](frontend/pages/courses/[id].vue:439)). `<video>` fires this several times per second — **probably 4+ writes/sec to SQLite during playback per user**. No throttle/debounce on the wire that I can see.
- Each save reads the entire JSON blob, mutates one course's subtree, writes the entire blob back. Quadratic-ish cost as a user accumulates progress across many courses.

### Toggling a favorite
- Mutation lives in the same `progress` JSON blob (a `favorite: true` key under the course). Saved via the same `/api/user-progress/[userId]` POST.
- Read separately by `/api/user-favorites/[id]` (which scans the blob for `favorite === true`).

### Theme change
- `useTheme.toggleTheme()` flips state, writes `localStorage.theme`, and (if logged in) `POST /api/users/theme` with `{userId, theme}`. The DB value wins on next login.

---

## 7. Configuration knobs

### `nuxt.config.js`
- `runtimeConfig.databasePath`: env `DATABASE_PATH`, default `/app/data/database/database.sqlite`.
- `runtimeConfig.public.apiBase`: literal `'/api'` (used nowhere meaningful — most fetches use absolute paths).
- No JWT / session secrets, no cookie config, no CORS, no rate limit, no password-hash settings.

### Env vars actually consulted at runtime
- `DATABASE_PATH` — DB file location.
- `CHOKIDAR_POLLING_INTERVAL` — file-watcher poll period in ms (0 disables the watcher).
- `HOST`, `PORT`, `NODE_ENV` — standard Nitro/Nuxt.

### Hardcoded values that should be config
- `/app/data/content` — course root, hardcoded in `courseHelpers.getContentDir()`, `user-progress/[userId].js`, `random-banner.js`, `courseWatcher.js`. Not configurable.
- `5` minute chunk cache, `1` minute file-handle cache, `10` minute thumbnail cache. Reasonable, but not adjustable.
- All `Cache-Control` strings in nuxt.config.js route rules.

### Static assets actually used
- Logos: `public/logos/skillgoblin-logo-square.png`, `-wide.png`, `-square.svg`.
- Favicons + Apple touch + web-app-manifest icons + `site.webmanifest`.
- `public/images/placeholder.png` — fallback course thumbnail.
- `public/banners/*.png` — six images chosen randomly on `/`.
- `public/default-thumbnail.jpg` — present, **unreferenced**.

---

## 8. Component / data dependency graph (compressed)

```
plugins/auth.js
   └─ useSession.checkAuth()  →  /api/users/[id]
                              →  setUser()  → localStorage.userId

middleware/auth.js
   └─ checks useSession.isAuthenticated

pages/index.vue  (no middleware)
   ├─ useUserManagement
   │     ├─ /api/users  (GET list, POST create)
   │     └─ /api/users/[id] + /api/users/auth  (login flow)
   ├─ useSession.login  (sets localStorage.userId)
   └─ AvatarSelector + Beanhead

pages/courses/index.vue  (auth middleware)
   ├─ useSession (userId, isAdmin)
   ├─ useTheme
   ├─ /api/courses, /api/categories, /api/status/scan
   ├─ /api/user-progress/[id], /api/user-favorites/[id], /api/user-progress-courses/[id]
   ├─ admin: /api/courses/edit, /api/courses/rescan
   └─ Components: CourseCard, CategoryFilterBar, SearchBar, TabNavigation,
                  UserProfile, ThemeToggle, ConfirmationModal,
                  CourseEditor, UserManagement

pages/courses/[id].vue  (auth middleware)
   ├─ useSession (userId)
   ├─ useTheme
   ├─ /api/courses/[id]
   ├─ /api/user-progress/[userId] (GET on load, POST on every timeupdate/ended)
   ├─ /api/courses/[id]/list-files, /api/courses/[id]/download-file
   ├─ /api/content/[...path]  ← <video src>
   └─ Components: CourseHeader, VideoPlayer, VideoInfo, VideoControlButtons,
                  CourseFilesModal
```

---

## 9. Concurrency / performance notes (background, not blockers)

- **better-sqlite3 is synchronous.** Every API request runs queries on the event-loop thread. With ~4 progress POSTs/sec/user during playback, multiple concurrent viewers would serialize. Acceptable for a homelab; not for many users.
- **User-progress is rewritten as a whole JSON blob per save.** Read whole blob → mutate one key → write whole blob. Linear in the size of the user's history. Not a bug today; will get slow if a user has hundreds of courses with deep progress.
- **`/api/categories` re-parses every course's `data` JSON each call.** Fine until thousands of courses.
- **Random-banner endpoint reads the directory each call.** Cheap.
- **Watcher uses chokidar polling** — set so on purpose for Docker bind-mount reliability. Default 60s. New course shows up at most 60s after drop-in.

---

## 10. Known dead, broken, or stub code

| File | Status | What we should do |
|---|---|---|
| [frontend/server/api/progress.js](frontend/server/api/progress.js) | **dead** — wrong schema, wrong type for userId, no callers | delete |
| [frontend/server/api/favorites.js](frontend/server/api/favorites.js) | **dead** — references non-existent `user_favorites` table, no callers | delete |
| [frontend/server/api/users/[id].js](frontend/server/api/users/[id].js) PUT/DELETE branches | **stub** — comments only, fall through to 405 | either implement (matching the canonical `/api/users` endpoint) or remove the branches and keep only GET |
| [frontend/server/api/users/[id].delete.js](frontend/server/api/users/[id].delete.js) | **partially broken** — would throw on `user_favorites` query, but there are no callers anyway | delete (the actual delete path is `delete.post.js`) |
| [frontend/server/api/settings/index.js](frontend/server/api/settings/index.js) | live but unused | leave or delete depending on whether we plan to use it; settings table is otherwise inert |
| `frontend/public/default-thumbnail.jpg` | unreferenced | safe to delete |

Cleanup is a separate concern from the auth rewrite, but doing it first will reduce the number of endpoints we need to retrofit later.

---

## 11. Auth / session rewrite — blast radius

This is the section that matters for the next phase. Every item below will need a coordinated change. Numbered by descending blast radius.

### 11.1 The single source of truth must move from localStorage to a server-issued cookie
- **What it touches:**
  - [frontend/composables/useSession.js:31, 106, 113](frontend/composables/useSession.js:31) — the three localStorage operations.
  - [frontend/plugins/auth.js](frontend/plugins/auth.js) — boot-time session restore.
  - [frontend/middleware/auth.js](frontend/middleware/auth.js) — currently checks in-memory state only.
- **What changes:** server issues a signed cookie on `/api/users/auth` success (or a new `/api/auth/login`). Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` when behind HTTPS, long expiry (e.g. 30 days) with sliding refresh. Frontend stops touching localStorage. `checkAuth()` becomes "GET /api/auth/me" — server reads cookie and returns the user or 401.
- **Why long expiry matters:** primary use is multi-hour video playback. Token must outlast a single binge.

### 11.2 Every mutating endpoint needs a real authorization check
Currently, there is **one** check (the spoofable `x-user-id` header in `/api/courses/edit`). We need a real one. The list of endpoints that mutate state and currently take the user identifier from the request body/path/header:

| Endpoint | Today's identity source | Should become |
|---|---|---|
| POST `/api/users` (create) | none (anyone) | admin only |
| PUT `/api/users` (update self/other) | body.id | own user, OR admin if `body.id !== session.userId` |
| DELETE `/api/users/[id].delete.js` | path param | admin only |
| POST `/api/users/delete` | body.userId | own user, OR admin |
| POST `/api/users/theme` | body.userId | own user (ignore body, use session) |
| POST `/api/user-progress/[userId]` | path param | own user (ignore path, use session) |
| POST `/api/courses/edit` | x-user-id header | admin via session, drop the header |
| POST `/api/courses/rescan` | none | admin |
| POST `/api/courses` (refresh/rescan) | none | admin |
| POST `/api/courses/[id]` (refresh/update) | none | admin |
| POST `/api/users/auth` | body.userId | n/a — this *is* the login |

GETs that leak data we should consider gating:
- `/api/users` — leaks `isAdmin`, `use_auth` for every user. Useful for the login screen, but can/should at least drop `isAdmin` and `created_at` for non-admins.
- `/api/user-progress/[userId]`, `/api/user-favorites/[id]`, `/api/user-progress-courses/[id]` — leak progress for any user if you know the UUID. Should require session = path param.

### 11.3 Hashed credentials at rest
- [frontend/server/api/users/auth.js](frontend/server/api/users/auth.js) compares plaintext.
- [frontend/server/api/users/index.js POST/PUT](frontend/server/api/users/index.js) inserts/updates plaintext.
- Migration plan: detect plaintext on read (e.g. password not in argon2 PHC format) → hash and rewrite. After all users have logged in once, the migration is complete.

### 11.4 Video streaming has to keep working
- `<video>` byte-range requests automatically include cookies, so `HttpOnly` session cookies are fine. **JWT-in-Authorization-header would NOT work for the `<video>` element** — that's an important gotcha. Stick with cookie-based sessions.
- The chunk/handle/thumbnail caches in `/api/content/[...path]` are keyed on the file path — they're already user-agnostic. Good. Adding an auth check at the handler level won't break the cache.

### 11.5 Progress save frequency vs. session refresh
- Progress POSTs hit on every `timeupdate` (~4/sec). If we add session refresh on activity, we'll be issuing/refreshing tokens that often unless we throttle.
- Two reasonable options:
  - Session cookie has long fixed expiry (30 days) → no refresh during playback, just renew on next login.
  - Sliding window with a debounce on the server side: only update `expires_at` if last update was >5 minutes ago.

### 11.6 CSRF
- We're moving to cookie-auth, so CSRF protection becomes meaningful. Options: double-submit token (separate `XSRF-TOKEN` cookie + header echo), or `SameSite=Strict` on the auth cookie. `SameSite=Strict` is the simplest; we don't have any cross-site flows.

### 11.7 First-run admin
- Today: there's no admin until someone manually checks the "Admin" box at create time on the first user. A self-hosted operator who doesn't notice can end up with no admin at all.
- Goal: detect "no admin exists" at boot and either (a) bootstrap from `ADMIN_NAME`/`ADMIN_PASSWORD` env vars (failing if unset), or (b) generate a random password and print it to the container logs once. Pick one for the spec; don't ship `admin/admin`.

### 11.8 The `users[id].js` PUT/DELETE stubs
- Either implement the canonical user-edit flow there (and deprecate the index PUT) or remove the branches entirely. Currently they make 405 the default for those methods, which is confusing.

### 11.9 Test coverage today: zero
- No `frontend/tests/`, no `*.test.*` files. The auth rewrite cannot rely on regressions being caught by CI. Either add a small integration test suite with the rewrite (recommended) or write a hand-checked test plan that covers each of the flows in §6.

---

## 12. Things this map intentionally does not cover (yet)

- **Performance under load** — the per-second progress saves and per-call category re-parse will matter someday but aren't blockers for the auth work.
- **Backup / restore** — there's no story today (the SQLite file + `/data/content/` directory are the entire state). Worth thinking about when we add migrations.
- **Telemetry / observability** — the only visibility into the running app is `console.log` to stdout. Fine for now, but worth a thought when we add new surfaces.

---

*This document is a snapshot. The codebase moves; this map should be re-validated whenever a server endpoint, DB column, or composable changes.*
