<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">
    <NuxtPage />
  </div>
</template>

<script setup>
// Initialize theme on app load
useTheme();

// Set client-only flag to ensure proper hydration
const nuxtApp = useNuxtApp();

// Force page refresh on client-side
if (process.client) {
  console.log('App initialized in client mode');
  
  // Add debugging for client-side rendering
  window.__MEDEMY_DEBUG = {
    initialized: true,
    timestamp: new Date().toISOString()
  };
}
</script>
