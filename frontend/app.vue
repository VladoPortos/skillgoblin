<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
    <NuxtPage />
  </div>
</template>

<script setup>
// Drive the document head from runtimeConfig.public.branding so operator-set
// APP_* env vars (read at server startup by frontend/server/plugins/branding.js)
// flow through to the title + meta tags after hydration. The static defaults
// in nuxt.config.js's app.head are what render in the SPA shell at first
// paint; useHead() updates them once the app mounts on the client. There's a
// brief flash for first-time visitors who set custom branding — acceptable
// for env-only branding that operators see only on initial page load.
const config = useRuntimeConfig();
const branding = config.public.branding;
useHead({
  title: branding.name,
  meta: [
    { name: 'description', content: branding.description },
    { name: 'theme-color', content: branding.themeColor },
    { name: 'msapplication-TileColor', content: branding.themeColor }
  ]
});

// Initialize theme on app load
useTheme();

// Set client-only flag to ensure proper hydration
const nuxtApp = useNuxtApp();

// Force page refresh on client-side
if (import.meta.client) {
  console.log('App initialized in client mode');

  // Add debugging for client-side rendering
  window.__MEDEMY_DEBUG = {
    initialized: true,
    timestamp: new Date().toISOString()
  };
}
</script>
