#!/bin/sh
# Container entrypoint — maps operator-facing APP_* env vars onto Nuxt's
# native NUXT_PUBLIC_BRANDING_* runtime-config override env vars BEFORE
# starting the node server.
#
# Background: nuxt.config.js declares runtimeConfig.public.branding with
# hardcoded SkillGoblin defaults so that Docker BUILD time (when 'npm run
# build' runs in Dockerfile.prod) doesn't bake operator env into the
# bundle — at build time, compose 'environment:' values do not exist.
#
# Nuxt 3 supports env-driven overrides of runtimeConfig at server startup
# via env vars matching the config structure (e.g. NUXT_PUBLIC_BRANDING_NAME
# overrides runtimeConfig.public.branding.name). However the operator
# interface is APP_NAME / APP_DESCRIPTION / APP_THEME_COLOR / APP_BACKGROUND_COLOR
# / APP_SHORT_NAME — this script is the one-way bridge.
#
# Without this mapping, operator-set APP_* values would be silently
# ignored by the client; only the /api/webmanifest endpoint (which reads
# process.env directly via readBranding) would see them, causing the SPA
# shell and the manifest to disagree.

set -e

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

exec node .output/server/index.mjs
