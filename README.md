# SkillGoblin

[![CodeQL](https://github.com/VladoPortos/skillgoblin/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/VladoPortos/skillgoblin/actions/workflows/codeql.yml)
[![Trivy](https://github.com/VladoPortos/skillgoblin/actions/workflows/trivy.yml/badge.svg?branch=main)](https://github.com/VladoPortos/skillgoblin/actions/workflows/trivy.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/VladoPortos/skillgoblin/badge)](https://scorecard.dev/viewer/?uri=github.com/VladoPortos/skillgoblin)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12762/badge)](https://www.bestpractices.dev/projects/12762)

A streamlined, self-hosted learning platform focused on simplicity and ease of maintenance.

## Project Vision

SkillGoblin is a lightweight, self-contained learning platform designed for local hosting. It focuses on video content delivery with minimal overhead, allowing for easy setup and maintenance without complex dependencies.

### Core Philosophy
- **Streamlined Experience**: Focus on content consumption, not marketing or social features
- **Local-First**: Designed to run on local networks without external dependencies
- **Lightweight**: Minimal resource usage and simple architecture
- **Easily Maintainable**: Modular design with minimal recompilation needed

## Features

- **Authentication & users**
  - Password and/or PIN login (every account must have at least one credential)
  - First-run admin bootstrap from environment variables
  - Multi-admin support with last-admin protection (server refuses any change that would leave zero active admins)
  - Cookie-based sessions stored server-side with revocation support
  - Admin panel for user activation, role/credential management, and session control

- **Content organization**
  - Course categories with color-coding
  - Hierarchical lesson structure
  - Video playback with progress tracking
  - Course descriptions and thumbnails
  - Natural sorting of video files
  - Real-time file monitoring for course updates and deletions

- **Mobile-friendly interface**
  - Responsive design works on all devices
  - Simple navigation for touch interfaces
  - Optimized video playback for mobile

## Technical stack

- **Frontend**: Nuxt 4 with Nitro server (Node 24)
- **Database**: SQLite (file-based) with a forward-only migration framework
- **Auth**: argon2id-hashed credentials, opaque cookie sessions
- **Containerization**: Docker for development and production
- **Video handling**: Direct file serving via Nitro
- **File monitoring**: Chokidar for real-time content updates

## Authentication & users

The auth model assumes a **trusted local network** with a small number of named users (think family / homelab). It is not designed for public internet exposure — see [Security model](#security-model) below.

### First-run bootstrap

On a fresh install with no admin user, the server **refuses to boot** unless both `ADMIN_NAME` and `ADMIN_PASSWORD` are set in the container environment. It creates the first admin from those env vars, then ignores them on subsequent boots (admins manage their own credentials from the panel).

```yaml
environment:
  - ADMIN_NAME=admin
  - ADMIN_PASSWORD=change-me-on-first-login
```

This replaces the older "random password printed to logs" pattern, which was easy to miss in compose dashboards or stripped logs. See [docker-compose.example.yml](docker-compose.example.yml) for the recommended layout.

### Auth modes

Every account must have at least one of:
- a password (any string), or
- a 4-digit PIN

Both is recommended — if the admin disables PINs globally, accounts with only a PIN are forced to set a password on next login.

### Sessions

A successful login sets an `HttpOnly`, `SameSite=Lax` cookie holding an opaque token. The server stores only the SHA-256 hash, one row per active session. Sessions live for 30 days with a sliding refresh (debounced to avoid hammering the DB during video progress saves). The same user can be logged in on multiple devices simultaneously; the admin panel can list and kick all sessions for any user.

### Roles & last-admin protection

Two-tier roles (`user` / `admin`). Multiple admins are supported. The server refuses any role demotion, deactivation, or deletion that would leave zero active admins — the "I locked myself out of my own homelab" scenario can't happen.

### Admin panel

Available to admins from the avatar dropdown in the top-right. Provides:
- Full user list with activate/deactivate, promote/demote, reset password, reset PIN, kick sessions, delete
- Pending-only filter for accounts awaiting admin approval
- Sessions drilldown per user (user-agent, last-seen, expires)
- System settings: toggle global `allow_pin` and `auto_approve_new_users`

### Rate limiting

`/api/users/auth` tracks failures per `(user_id, ip)` in process memory. After five wrong attempts, requests are 429-locked for 30 seconds, doubling on each subsequent block (60s, 120s, 240s, capped). Cooldown clears on a successful login. The bucket is per-process, so cluster-mode deployments would have separate buckets.

## Security model

SkillGoblin is **homelab-grade**. Concretely:

- **Not internet-facing.** Run it on a LAN, on a tailnet, or behind a VPN. Don't expose it directly.
- **Proxy configuration.** Rate limiting uses the transport peer by default. Set `TRUST_PROXY_HOPS` only for a known number of trusted proxies that sanitize forwarded headers. HTTPS cookie detection uses `X-Forwarded-Proto`; set `COOKIE_SECURE=true` behind an HTTPS proxy to force secure cookies.
- **PIN brute-force surface.** A 4-digit PIN is 10,000 possibilities. Rate limiting helps but doesn't make PINs internet-grade. An admin who needs to expose a wider attack surface can disable PINs globally from the admin panel; existing PIN-only users are then prompted to set a password on next login.
- **Credentials at rest.** Passwords and PINs are argon2id-hashed. Plaintext rows from older versions are detected on first login and rehashed inline.
- **Sessions revoke server-side.** The cookie is opaque; revocation is a `DELETE` on the `user_sessions` row. "Log out all devices" and admin "kick sessions" both work this way.

If you want production-grade hardening (WAF, internet-grade rate-limit budgets, 2FA), this isn't the right tool — and that's deliberate. The audience is one operator who knows their tenants.

## Configuration

The application reads the following environment variables:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_NAME` | First-run only | — | Name of the auto-created admin on first boot. Ignored once an admin row exists. |
| `ADMIN_PASSWORD` | First-run only | — | Password for the auto-created admin. Ignored once an admin row exists. |
| `ALLOW_USER_REGISTRATION` | No | `true` | When `false`, the public "New User" tile on the login screen is hidden and self-signup is refused. Admins can still create accounts from the Admin Panel. Runtime-toggleable from Admin Panel → Settings after first boot. |
| `APP_NAME` | No | `SkillGoblin` | Display name shown in the browser tab title, the login screen `<h1>`, the courses page header, and the PWA install label. |
| `APP_SHORT_NAME` | No | (`APP_NAME`) | Short display name used by the PWA install icon. Defaults to `APP_NAME` when unset. |
| `APP_DESCRIPTION` | No | `A streamlined, self-hosted learning platform` | Meta description tag and PWA manifest `description`. |
| `APP_THEME_COLOR` | No | `#111827` | Mobile browser chrome bar color and PWA manifest `theme_color`. Hex `#RRGGBB` or `#RGB`; invalid values fall back to default and log a startup warning. NOTE: This is the browser-chrome color, not the in-app dark/light theme. |
| `APP_BACKGROUND_COLOR` | No | `#111827` | PWA splash screen background. Same hex format as `APP_THEME_COLOR`. |
| `CONTENT_DIR` / `CONTENT_PATH` | No | `/app/data/content` | Directory inside the container where course folders live. `CONTENT_PATH` is retained as a compatibility alias. |
| `NUXT_DATABASE_PATH` / `DATABASE_PATH` / `DB_PATH` | No | `/app/data/database/database.sqlite` | Runtime SQLite path, in the listed precedence order. The server and operator CLI share this resolution. |
| `CHOKIDAR_POLLING_INTERVAL` | No | `60000` | File watcher polling interval in milliseconds. Set to `0` to disable the watcher entirely (e.g. on Unraid, to stop drives spinning up). |
| `HOST` | No | `0.0.0.0` | Bind address. |
| `NEW_BADGE_DAYS` | No | `7` | How recent (in days) a course must be to render the `NEW` badge on its card. Set to `0` to disable the badge entirely. |
| `PORT` | No | `3000` | Listen port. |

`ADMIN_NAME` and `ADMIN_PASSWORD` are only consulted on a fresh install. Once any admin user exists in the database, both env vars are ignored — admins reset their own passwords from the panel.

### Branding / custom logos

To replace the bundled SkillGoblin logos with your own, drop PNG files into a `branding/` subdirectory inside your mounted data volume:

| File | Used for | Recommended size |
|---|---|---|
| `data/branding/logo.png` | Small square logo on the courses page header and course detail header | ≥ 256 × 256 px, square aspect |
| `data/branding/login-banner.png` | Wide banner on the login screen above the user picker | ≤ 1200 × 500 px, wide aspect (landscape) |

Both files are optional. Missing `logo.png` falls back to the bundled square SkillGoblin logo. Missing `login-banner.png` falls back to the bundled rotating banner set (one of the random images in `frontend/public/banners/`).

Providing `login-banner.png` **disables the random banner rotation** — operators who want their own single brand image on the login screen rather than the rotating built-in set should drop one in.

Files are served via `/api/logo` and `/api/login-banner` with a 5-minute cache. Drop a new file and the change shows up within ~5 minutes (or immediately on a hard reload).

Favicon family (`favicon.ico`, apple touch icon, PWA manifest icons) is currently bundled and not operator-configurable.

## Quick start

### Production (recommended)

Copy [docker-compose.example.yml](docker-compose.example.yml) to `docker-compose.prod.yml` and edit the `ADMIN_NAME` / `ADMIN_PASSWORD` values, then:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Visit `http://<host>:3000`, sign in as the bootstrap admin, change the password, and create accounts for each user from the admin panel.

### Development

```bash
# Set the bootstrap admin once (subsequent boots ignore these)
export ADMIN_NAME=admin
export ADMIN_PASSWORD=dev-password

# Start in dev mode (hot reload)
docker compose up
```

### Adding new courses

1. Create a folder under `data/content/` named after the course.
2. Add lesson subfolders with video files.
3. The watcher picks them up automatically. You can also trigger a rescan from the admin avatar dropdown.

### Removing courses

Delete the course folder from `data/content/`. The watcher marks it unavailable and hides it from the library, preserving metadata and progress. Restore the same folder and rescan to make it available again. An empty or disconnected media mount does not erase course history.

## Recovery and diagnostics

- [Backup, restore, and password recovery](docs/operations.md)
- [Progress saves, conflict handling, and stable video IDs](docs/progress.md)
- [Library and media diagnostics](docs/library-diagnostics.md) in Admin Panel → Diagnostics
- [Node 24, AMD64/ARM64 images, tested publishing and digest promotion](docs/deployment.md)

## Upgrading from a previous version

Back up the database before upgrading. New migrations preserve unavailable courses and translate old positional progress to stable video IDs before scanning. Reload open browser tabs after upgrading; the progress API now requires a revision with each write. See [progress migration details](docs/progress.md).

Existing installations are migrated forward automatically. The migration framework records each applied migration in a `migrations` table; on boot, any new migrations run in numeric order inside a transaction. Migrations are forward-only — there is no rollback step.

The 002_auth_hardening migration (run on first boot of this version) does the following on existing databases:

- Drops the legacy `use_auth` column. Auth is now mandatory for all accounts.
- Adds an `is_active` column (defaulting to 1 for existing rows so nobody gets locked out by the upgrade).
- Creates the `user_sessions` and `system_settings` tables.

What you'll see depending on the prior state of your install:

- **Plaintext passwords / PINs.** Detected on each user's next successful login and rehashed inline (argon2id). Users do not need to do anything — they just log in normally.
- **Users with no credentials.** Boot prints a warning listing them. Legacy regular users can initialize credentials on the trusted LAN. Administrator accounts require the [operator recovery command](docs/operations.md#recover-a-forgotten-password-or-a-legacy-administrator-without-credentials); they cannot be claimed through the public API.
- **No admin user exists.** The server refuses to boot until you set `ADMIN_NAME` / `ADMIN_PASSWORD` (see [First-run bootstrap](#first-run-bootstrap)).
- **An admin already exists.** Bootstrap is skipped and the env vars are ignored. You log in with your existing admin credentials.

### Upgrading to the non-root container

Recent versions run the app as the unprivileged `node` user (uid/gid `1000`) instead of root. If you're upgrading from a release that ran as root, your bind-mounted host data directory is likely owned by root.

**No action needed on the host.** The entrypoint detects this on every start and repairs ownership of `data/database/`, `data/branding/`, and the app-managed files (`course.json`, `thumbnail.png`) under `data/content/` before dropping to `node`. Video files keep their original ownership — mode 644 read access is sufficient for streaming. Just `docker compose pull && docker compose up -d` and the upgrade goes through.

Operators who'd rather manage permissions themselves can opt out:
- `user: "1000:1000"` in compose — entrypoint detects non-root start and skips the chown pass entirely.
- `SKILLGOBLIN_SKIP_PERM_REPAIR=1` env — drops privileges to `node` but skips the chown pass. Useful when the host already grants UID 1000 the required access.

The Node process (the only thing on the network) never runs as root. The brief root window is bounded to the entrypoint's chown pass and `exec`-replaced into uid 1000 via `su-exec` before any TCP listener exists.

## Content management

### File structure

```
data/
├── database/
│   └── database.sqlite    # SQLite database
└── content/
    ├── Course Name/
    │   ├── thumbnail.jpg     # Course thumbnail (or thumbnail.png)
    │   ├── course.json       # Optional metadata override (title, description, etc.)
    │   ├── Lesson 1/
    │   │   ├── 1. video1.mp4
    │   │   ├── 2. video2.mp4
    │   │   └── 1. video1.srt    # Optional subtitle sidecar (auto-converted to WebVTT)
    │   └── Lesson 2/
    │       └── 1. video1.mp4
    └── Another Course/
        └── ...
```

### `course.json` override

Drop a `course.json` next to `thumbnail.png` to pin metadata for that course.
The scanner reads it after auto-detection, and the values win over both
auto-detected metadata *and* values stored in the database. Schema:

```json
{
  "title": "Optional human title",
  "description": "Optional description shown on cards and the detail page",
  "category": "Optional category",
  "releaseDate": "2025-01-15"
}
```

All fields are optional and must be strings. Unknown keys are ignored with a
console warning. The thumbnail, lessons, and id are still derived from the
folder structure and the `thumbnail.png` convention.

#### Exporting from the admin panel

Admins can write a `course.json` for every course at once: open the avatar
dropdown → Admin Panel → **Content** → **Export all to course.json**. The
existing CourseEditor modal also has a per-course **Export to course.json**
button; it shows a yellow banner when a `course.json` is already present so
you know your edits will be reverted on the next rescan unless you re-export.

### Subtitles

Drop a sidecar `.srt` next to a video (same basename, e.g. `01-intro.mp4`
and `01-intro.srt`). The server detects it at scan time, exposes a
`subtitle` field on the video payload, and serves the matching `.vtt` URL
via on-the-fly SRT-to-VTT conversion. The player lists every text track the
browser exposes, including subtitles embedded in the video container and the
sidecar track. Selecting a language hides every other track; selecting the
active language again turns subtitles off. The preference is restored for the
next lesson when a matching track is available.

Sidecars default to language code `en`. Set `SUBTITLE_LANGUAGE` to another
BCP 47 language code and optionally set `SUBTITLE_LABEL` to the label you want
shown in the player. The selector itself is language-agnostic and derives its
buttons from the browser's `TextTrackList`.

### File monitoring

- Real-time monitoring of the content directory
- Automatic detection of new courses and course updates
- Missing courses are marked unavailable and hidden from the library
- Metadata and user progress are retained for unavailable courses

### Benefits

- Add or modify courses by copying folders
- No database interaction required for content management
- Easy to backup, version control, or transfer courses
- Natural organization that matches how video content is typically structured

The application scans the content directory on startup to index available courses.

### Newest-first sort

The courses page has a sort dropdown next to the search bar. Pick "Newest
first" to order courses by `created_at DESC` (most recently added first).
The choice is stored in the URL so reloads and bookmarks preserve it.

## Project structure

```
skillgoblin/
├── docker-compose.yml         # Development Docker config
├── docker-compose.prod.yml    # Production Docker config
├── docker-compose.example.yml # Recommended production layout with auth env vars
├── docker-compose.test.yml    # Vitest + Playwright test stack
├── Dockerfile.prod            # Production image (multi-stage build)
├── frontend/                  # Nuxt application
│   ├── pages/                 # Page components
│   ├── components/            # Reusable UI components (incl. AdminPanel)
│   ├── composables/           # Shared composables (useSession, etc.)
│   ├── server/
│   │   ├── api/               # Endpoint handlers
│   │   ├── middleware/        # session.js — populates event.context.user
│   │   ├── migrations/        # Numbered, forward-only schema migrations
│   │   ├── plugins/           # bootstrap.js — first-run admin
│   │   └── utils/             # authz, sessions, credentials, rate-limit, ...
│   └── tests/
│       ├── unit/              # Vitest
│       └── e2e/               # Playwright
└── data/                      # Persistent data
    ├── database/              # database.sqlite
    └── content/               # Course videos and assets
```

## Running tests

The full test suite runs in Docker against a fresh production build of the app:

```bash
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml run --rm --build tests
```

This runs the Vitest unit suite followed by the Playwright e2e suite against an isolated app container. Media fixtures are copied into disposable named volumes; tracked fixtures and normal application data are not modified. The compose file sets a known `ADMIN_NAME` / `ADMIN_PASSWORD` for the test container; don't change those without also updating the test fixtures.

## Troubleshooting

### "SkillGoblin refused to start: no admin account exists..."

The bootstrap plugin found no admin row and the env vars aren't set. Add `ADMIN_NAME` and `ADMIN_PASSWORD` to your container environment and restart. See [First-run bootstrap](#first-run-bootstrap).

### Course content not appearing

1. Check that the course folder exists in `data/content/`
2. Check the application logs for any error messages
3. Ensure video files are in supported formats (MP4 recommended)
4. Try a manual rescan from the admin avatar dropdown

### Locked out of admin

Use another administrator's Admin Panel, or run the included operator command in Docker. List users, then replace `USER_ID` with the account ID:

```sh
docker compose -f docker-compose.prod.yml exec --user 1000:1000 skillgoblin node /app/scripts/operator.js users
docker compose -f docker-compose.prod.yml exec --user 1000:1000 skillgoblin node /app/scripts/operator.js reset-password --user-id USER_ID
```

The hidden prompt asks twice for a new password. Reset preserves the account and progress, clears its PIN, and revokes its sessions. See [operations](docs/operations.md) for stdin, stopped-container, backup, and restore instructions.

### Database issues

Use a consistent live backup and validated offline restore from the [operations guide](docs/operations.md). Restore makes a safety backup before replacing the database and revokes restored sessions. Back up media and branding separately.

## License

SkillGoblin is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [LICENSE](LICENSE) for the full text.

In short:

- **You can** run SkillGoblin yourself, modify it, and share modified versions — for personal, internal, or community use.
- **You must** keep the source open: if you distribute a modified version, **or run a modified version on a server that other users interact with over a network**, you must make the modified source available to those users under the same AGPL-3.0 terms.
- **You must** include the copyright notice and license text in any copy or derivative.

This is the standard license for self-hosted web apps (Bitwarden, Mastodon, Nextcloud, Plausible) — it lets you do whatever you want privately while preventing closed-source SaaS rebrands.

## Changelog

### 03.05.2026 — Auth hardening

Major rewrite of the user/auth system:
- argon2id-hashed credentials with inline rehash for legacy plaintext rows
- Cookie-based sessions stored in `user_sessions`, with admin "kick sessions" and per-user "log out all devices"
- Server-side `requireAuth` / `requireAdmin` / `requireSelfOrAdmin` enforcement on every mutating endpoint (replaces a spoofable `x-user-id` header pattern)
- First-run admin bootstrap from `ADMIN_NAME` / `ADMIN_PASSWORD` env vars; refuses to start otherwise
- Multi-admin with last-admin protection
- Rate limiting on the auth endpoint
- Forward-only migration framework (`migrations` table)
- Admin panel UI (user activation, role/credential management, system settings, sessions drilldown, pending-only filter)
- Login modes: password / PIN / both — never neither
- Runtime-toggleable system settings (`allow_pin`, `auto_approve_new_users`)
- Comprehensive test suite: ~75 vitest unit tests + ~58 Playwright e2e tests, all running in a dockerized test stack

### 23.05.2025

- Fixed forced rescan upon long inactivity, app now checks if the DB is populated already and not force rescan if not needed, Leaving it to periodic check or manual trigger.
- thumbnail.png. If there is no thumbnail.png, default thumbnail is used. If there is thumbnail.png, it will be used and added to DB. If you add thumbnail.png to a course via edit the local thumbnail.png will be replaced with the one added. Already existing thumbnails should be managed via UI, adding new thubnail file manualy to existing one in folder will not change it.
- Added Button to browse non video files in course folderm, with option to download individual files. Should be at bottom of the individual course display.
