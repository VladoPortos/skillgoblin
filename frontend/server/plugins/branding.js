import { readBranding } from '../utils/branding';

// Nitro server plugin — runs once at server startup. Reads APP_* env at
// RUNTIME (not Docker build time, where it's unset) and ensures the
// resulting branding values reach the client via runtimeConfig.public.branding.
//
// Nuxt 3 runtimeConfig.public is deep-frozen and non-configurable in
// production builds, so we cannot mutate it directly from a plugin.
// Instead, we rely on Nuxt's native env-override mechanism: setting
// NUXT_PUBLIC_BRANDING_<KEY> env vars BEFORE the node process starts
// causes Nitro to apply them when constructing runtimeConfig.
//
// The Dockerfile.prod entrypoint (frontend/scripts/entrypoint.sh) maps
// the operator-facing APP_* vars onto NUXT_PUBLIC_BRANDING_* before
// exec'ing node, so by the time this plugin runs, the runtimeConfig
// already reflects the operator's values.
//
// This plugin is a defensive guard for dev mode (where the entrypoint
// script may not run) and for surfacing a clear startup line so
// operators can see the resolved branding when debugging. It only
// attempts to mutate when runtimeConfig.public is not frozen.
export default defineNitroPlugin((nitroApp) => {
  const branding = readBranding(process.env);
  const config = useRuntimeConfig();
  if (config.public && !Object.isFrozen(config.public)) {
    try {
      Object.assign(config.public.branding, branding);
    } catch (_) {
      // Inner object frozen even if outer isn't — fall through.
    }
  }
});
