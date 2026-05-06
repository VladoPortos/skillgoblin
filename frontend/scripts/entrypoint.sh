#!/bin/sh
# Container entrypoint. Two responsibilities, in order:
#
#  1. (root pass) Repair host bind-mount ownership and drop privileges.
#     Runs only when the container started as root, which is the default
#     for our image. Bounded to /app/data/database and /app/data/branding
#     because they need write access; /app/data/content is intentionally
#     left alone since read access is sufficient and recursive chown of a
#     potentially huge content folder on every start would be pathological.
#     After fixup, su-exec re-runs this same script as the `node` user
#     (uid 1000), which falls through to the second pass below.
#
#  2. (node pass) Map operator-facing APP_* env vars onto Nuxt's native
#     NUXT_PUBLIC_BRANDING_* runtime-config override env vars BEFORE
#     starting the node server.
#
# Operators who'd rather manage permissions themselves can pin the runtime
# user in their compose file (`user: 1000:1000`). The container then starts
# as uid 1000 from the start, the root pass below is skipped automatically,
# and the script falls straight through to the env mapping.
#
# Background on the env mapping: nuxt.config.js declares
# runtimeConfig.public.branding with hardcoded SkillGoblin defaults so that
# Docker BUILD time (when 'npm run build' runs in Dockerfile.prod) doesn't
# bake operator env into the bundle — at build time, compose 'environment:'
# values do not exist. Nuxt 3 supports env-driven overrides of
# runtimeConfig at server startup via env vars matching the config
# structure (e.g. NUXT_PUBLIC_BRANDING_NAME overrides
# runtimeConfig.public.branding.name). The operator interface, however, is
# APP_NAME / APP_DESCRIPTION / APP_THEME_COLOR / APP_BACKGROUND_COLOR /
# APP_SHORT_NAME — this script is the one-way bridge.

set -e

# ---------------------------------------------------------------------------
# Pass 1: root -> repair perms -> drop to `node` and re-exec.
# ---------------------------------------------------------------------------
if [ "$(id -u)" = "0" ]; then
  # SKILLGOBLIN_SKIP_PERM_REPAIR=1 disables the chown pass below while
  # still dropping to the node user. Used by docker-compose.test.yml,
  # where /app/data/branding and /app/data/content are bind-mounted from
  # tracked repo fixtures and a recursive chown would dirty the working
  # tree on the host.
  if [ "${SKILLGOBLIN_SKIP_PERM_REPAIR:-}" != "1" ]; then
    # Best-effort recursive chown for paths that need full write access.
    # If the host has gone out of its way to make the volume non-chownable
    # (read-only mount, exotic ACLs), we let the database open fail later
    # with its own clearer error rather than aborting startup here -- the
    # operator can still recover from inside the container.
    for dir in /app/data/database /app/data/branding; do
      if [ -d "$dir" ]; then
        if ! chown -R node:node "$dir" 2>/dev/null; then
          echo "[skillgoblin] warn: chown of $dir failed; continuing as-is" >&2
        fi
      fi
    done
    # data/content can be huge (typical course library = dozens of GB of
    # video). Recursive chown on every restart would be pathological. Two
    # targeted passes instead:
    #   1. chown directory entries so the node user can CREATE new files
    #      inside them (admin "Export course" and "Upload thumbnail" both
    #      drop fresh files into per-course directories).
    #   2. chown the specific filenames the app itself writes
    #      (course.json and thumbnail.png) -- overwriting an existing
    #      file with writeFileSync needs write perm on the FILE, not
    #      just its parent. Operator-supplied cover.jpg / poster.jpg /
    #      video files etc. stay under their original ownership; the
    #      app only ever reads those.
    if [ -d /app/data/content ]; then
      if ! find /app/data/content -type d -exec chown node:node {} + 2>/dev/null; then
        echo "[skillgoblin] warn: chown of content directory tree failed; continuing as-is" >&2
      fi
      if ! find /app/data/content -type f \( -name 'course.json' -o -name 'thumbnail.png' \) -exec chown node:node {} + 2>/dev/null; then
        echo "[skillgoblin] warn: chown of app-managed files in content failed; continuing as-is" >&2
      fi
    fi
  fi
  # Drop privileges and re-enter this script as `node`. exec-replace so the
  # node process is still PID 1 from Docker's perspective (signal handling,
  # zombie reaping, healthcheck behavior all stay correct).
  exec su-exec node:node "$0" "$@"
fi

# ---------------------------------------------------------------------------
# Pass 2: running as `node` (uid 1000). Map env and launch.
# ---------------------------------------------------------------------------

# Map APP_* -> NUXT_PUBLIC_BRANDING_* only when NOT already set, so an
# explicit NUXT_PUBLIC_BRANDING_* override (e.g. for testing) wins.
if [ -n "${APP_NAME:-}" ] && [ -z "${NUXT_PUBLIC_BRANDING_NAME:-}" ]; then
  export NUXT_PUBLIC_BRANDING_NAME="$APP_NAME"
fi
if [ -n "${APP_SHORT_NAME:-}" ] && [ -z "${NUXT_PUBLIC_BRANDING_SHORT_NAME:-}" ]; then
  export NUXT_PUBLIC_BRANDING_SHORT_NAME="$APP_SHORT_NAME"
fi
if [ -n "${APP_DESCRIPTION:-}" ] && [ -z "${NUXT_PUBLIC_BRANDING_DESCRIPTION:-}" ]; then
  export NUXT_PUBLIC_BRANDING_DESCRIPTION="$APP_DESCRIPTION"
fi
if [ -n "${APP_THEME_COLOR:-}" ] && [ -z "${NUXT_PUBLIC_BRANDING_THEME_COLOR:-}" ]; then
  export NUXT_PUBLIC_BRANDING_THEME_COLOR="$APP_THEME_COLOR"
fi
if [ -n "${APP_BACKGROUND_COLOR:-}" ] && [ -z "${NUXT_PUBLIC_BRANDING_BACKGROUND_COLOR:-}" ]; then
  export NUXT_PUBLIC_BRANDING_BACKGROUND_COLOR="$APP_BACKGROUND_COLOR"
fi

# exec "$@" runs whatever Docker passed as CMD (default: `node
# .output/server/index.mjs`, set in Dockerfile.prod). Routing through
# this entrypoint means a `docker run image bash` or compose
# `command: <something>` override still benefits from the root-pass
# drop above instead of running as root.
if [ "$#" -eq 0 ]; then
  exec node .output/server/index.mjs
fi
exec "$@"
