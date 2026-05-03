// https://nuxt.com/docs/api/configuration/nuxt-config
import { readBranding } from './server/utils/branding.js';

const branding = readBranding();

export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxtjs/tailwindcss'
  ],
  // Disable SSR to prevent hydration mismatches with complex components
  ssr: false,
  nitro: {
    // Configure for better handling of large static files and caching
    routeRules: {
      // Content caching - allow byte ranges for videos but keep cache control
      '/content/**': {
        static: true,
        headers: {
          'Accept-Ranges': 'bytes',
        }
      },
      // API endpoints - prevent caching to ensure fresh data
      '/api/**': {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      },
      // Main HTML pages - prevent caching to always show latest content
      '/**': {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    }
  },
  app: {
    head: {
      title: branding.name,
      meta: [
        { name: 'description', content: branding.description },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'msapplication-TileColor', content: branding.themeColor },
        { name: 'theme-color', content: branding.themeColor },
        // Add meta tags to control browser caching
        { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' },
        { 'http-equiv': 'Pragma', content: 'no-cache' },
        { 'http-equiv': 'Expires', content: '0' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/api/webmanifest' }
      ]
    }
  },
  runtimeConfig: {
    // The private keys which are only available server-side
    databasePath: process.env.DATABASE_PATH || '/app/data/database/database.sqlite',
    // Public keys that are exposed to the client
    public: {
      apiBase: '/api',
      branding
    }
  }
})
