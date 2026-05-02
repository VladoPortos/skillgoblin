# SkillGoblin — feature wishlist & constraints

Working doc. Captures what we want to build (drawn from community contributions and our own goals) plus the deployment constraints they have to fit. Not tied to any specific PR.

## Constraints we must respect

- **Self-hosted, default-trust deployment.** App is meant to run locally / on a home network among trusted users, not exposed to the internet. Auth must add real protection but cannot turn the product into something painful for solo / family use.
- **Long-running sessions.** Primary use is streaming long-form video tutorials. A session must comfortably outlast a multi-hour viewing without bouncing the user mid-stream. Token/cookie lifetime should be measured in days, with a refresh path that is invisible during normal viewing.
- **Backwards-compatible upgrades.** Existing installs with prior schema versions must keep working. Schema changes need migrations; we cannot brick existing databases.
- **No regressions to the streaming experience.** Anything we layer on top of the video pipeline (auth, rate limiting, CSRF) must keep byte-range requests working for `<video>` element scrubbing.

## Features we want

### Authentication & user management
- Auth modes (locked): **password**, **PIN**, or **both**. Never neither.
  - Drops the current "no auth" mode entirely. Reason: with shared profiles on a TV / family device, a second person clicking a no-auth profile mid-stream would silently hijack the first person's session and progress would flip-flop between viewers.
  - The signup form must validate that at least one of password / PIN is set. The schema enforces it too (CHECK constraint or NOT NULL after migration).
  - The `use_auth` column on `users` is removed — having a credential is now the only signal.
  - If both password and PIN are set, login succeeds with whichever is supplied (keeps the existing UX).
  - **Strongly encourage both** at signup and from the profile editor — a one-line nudge ("set both so a fallback exists if PINs are ever disabled"). Not enforced.

- Upgrade-day login UX for accounts in legacy states (locked):
  - **No-credentials user clicks their card**: instead of logging them in, show a one-shot setup modal: "For security, this version no longer supports profiles without a password or PIN. Please set one (both recommended)." On submit, set credentials → log them in → done. Same account, just hardened in place.
  - **PIN-only user when admin has globally disabled PINs**: the existing PIN still authenticates them once (so they're not locked out), but the very next screen prompts them to set a password before continuing. After they set it, future logins use the password. Same UX shape as above.
  - Both flows share the same component — "your account needs a credential update, here's why, here's the form."

- PIN policy (locked, runtime-toggleable):
  - Admin can disable PINs globally (`system_settings.allow_pin = false`). Default is `true` (PINs allowed).
  - When `allow_pin = false`:
    - New signups can only set a password.
    - Existing PIN-only users get the upgrade prompt described above on their next login.
    - The PIN field on the existing-user UI hides; only the password input shows.
  - Threat note: 4-digit PINs are 10,000 possibilities. The toggle exists so an admin who exposes their instance more widely (or just gets nervous) can downgrade to password-only without redeploying.

- Rate limiting on `/api/users/auth` (locked, light-touch):
  - Track failure count per `(user_id, ip)` in memory (simple map, no DB needed for this).
  - Soft lockout after 5 consecutive failures: 30-second cooldown, doubling each subsequent block (60s, 120s, 240s, capped). Cooldown clears on a successful login.
  - Not paranoid-grade — this is a local-network app, not internet-exposed. Goal is "stop a stuck client retrying in a loop and stop someone idly poking PINs from inside the LAN," not "withstand a determined attacker."
- **Real session layer** (locked):
  - Server issues an opaque session token on successful login.
  - Token delivered as an `HttpOnly`, `SameSite=Lax`, `Secure`-when-HTTPS cookie. Cookie-based (not Bearer) because `<video>` byte-range requests can't carry custom headers.
  - **Sessions live in a new `user_sessions` table** — one row per session (so the same user can watch on phone + laptop + TV at once, and we get "log out all devices" for free). Shape: `(token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)`. Surviving container restarts is a feature, not a side-effect.
  - Long fixed lifetime (~30 days), with a debounced sliding refresh: only update `last_seen_at` / `expires_at` if it's been more than 5 minutes since the last bump. Avoids hammering the DB during the ~4-times-per-second progress saves a video player generates.
  - Server-side revoke: admin "kick session" + user "log out all devices" both become a `DELETE FROM user_sessions WHERE ...`.
- **Hashed credentials** at rest (locked): argon2id; bcrypt acceptable fallback.
  - Migration path: inline-on-read. On the next login each user does, detect plaintext (no `$argon2id$` PHC prefix) → hash on the fly → rewrite the row. After everyone has logged in once, migration is complete.
  - Boot-time warning: log a list of any users currently sitting in the legacy `use_auth=0` / no-credential state. They can't log in under the new rules; an admin needs to set a password or PIN for them in the user-management panel before they're usable again.
  - PIN reality check: 4-digit PINs are 10,000 possibilities — argon2id alone won't save you from someone who can hammer `/api/users/auth`. The auth endpoint must rate-limit (e.g. exponential backoff per `(user_id, ip)` pair, lockout after N consecutive failures). This applies to passwords too but matters most for PINs.
- **Server-side authorization on every mutating endpoint.** No more relying on the UI to gate admin actions. Specific endpoint-by-endpoint plan lives in `architecture-map.md` §11.2.
- **Roles** (locked): two-tier `user` / `admin`. Multi-admin supported from day one. **No superadmin** — instead, a "last admin is protected" invariant: server refuses any `PUT`/`DELETE` that would leave zero admins. Cheap to add, kills the "I locked myself out of my own homelab" scenario.
- **User activation flow** (locked): the `is_active` column always exists; the question is its *default value* at create time.
  - **Strict mode** (default): new accounts created with `is_active = 0`. Admin must activate from the user-management panel before login works.
  - **Loose mode** (opt-in, for solo / family installs that don't want the friction): new accounts created with `is_active = 1` immediately.
  - Setting is **runtime-toggleable from the admin panel** (not just an env var). Stored in a new `system_settings` key-value table (keyed `auto_approve_new_users`). Env var `REQUIRE_ADMIN_APPROVAL=true|false` only seeds the default at first boot; after that the admin UI wins.
  - Why a real settings table instead of just env? Operator wants to flip the policy without restarting the container. The existing `settings` table is user-scoped (FK to users.id) so it isn't suitable; we add a sibling `system_settings` table for global config.
- **Default admin on first run** (locked): refuse to boot if `ADMIN_NAME` and `ADMIN_PASSWORD` env vars aren't set on a fresh install. Reason: the random-password-print-to-logs path is fragile — operators sometimes can't reach logs (compose orchestration, dashboards that swallow stdout, log retention gone, etc.). Failing fast with a clear error message is the cleaner contract.
  - The README must document this explicitly with example compose snippets.
  - On subsequent boots (an admin row already exists), the env vars are not consulted — admins manage their own credentials from the panel.
- **Admin panel**: list users, see auth/active state, activate/deactivate, change role, reset password/PIN, delete. Keep this UI close to what we already have — it's nicely scoped.
- **Profile editor**: name, avatar, change/remove/switch own auth method. The avatar customization (Beanhead component) stays.

### Customization (cosmetics)
- App name + short name configurable via env (window title, web manifest, header).
- App description configurable.
- Theme color / background color configurable.
- Custom logo: drop a `logo.png` in a documented location, served via `/api/logo`. Falls back to the bundled defaults if absent.
- Web manifest generated dynamically so the PWA install experience reflects the operator's branding.

### Course content polish
- **`course.json` metadata override**: a course folder can include `course.json` to set `title`, `description`, `category`, `releaseDate`, etc. Folder-derived defaults still work without it.
- **SRT → VTT auto-conversion** so user-supplied subtitles play in `<video>` directly. Detect language from filename suffixes (`name.en.srt`, `name_es.srt`) and label tracks accordingly.
- **Captions vs subtitles distinction** when the filename hints (e.g. `*_cc.*`).
- **Per-lesson README** rendered alongside the video player.

### UI polish
- Missing icons in the user dropdown menu.
- Avatar live preview while editing profile.

## Out of scope (for now)
- Multi-tenant / multi-org auth. Single-instance install only.
- OAuth / SSO. Not worth the surface area for a homelab tool.
- 2FA. Maybe later, but not part of this round.
- Public-internet-grade hardening (rate-limit budgets, WAF rules). We document "don't expose this to the internet" instead.

## Schema-migration impact (heads-up for the build phase)

This round's changes touch the `users` table in ways that need real migrations — `CREATE TABLE IF NOT EXISTS` won't cut it on upgraded installs.

| Change | Mechanism |
|---|---|
| Drop `use_auth` column | `ALTER TABLE users DROP COLUMN use_auth` (SQLite ≥ 3.35) |
| Hash plaintext passwords/PINs | inline-on-read on next login per user |
| Add `is_active` column | `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1` (default 1 so existing users aren't locked out by the upgrade itself; new users follow the activation policy) |
| Add `user_sessions` table | `CREATE TABLE IF NOT EXISTS user_sessions(...)` |
| Add `system_settings` table | `CREATE TABLE IF NOT EXISTS system_settings(...)` |
| Enforce "password OR pin" | app-level on create/update; optional CHECK constraint via table-rebuild |

We should also introduce a tiny schema-version mechanism (single-row table or `PRAGMA user_version`) so future rounds don't have to keep guessing whether a migration ran.

## Open questions

None outstanding for the auth/user-management round. (All earlier questions answered above.)

Open for the next rounds: customization features (env vars vs admin-panel-managed), the course-pipeline polish (course.json, SRT/VTT, README per lesson) — none blocking auth.
