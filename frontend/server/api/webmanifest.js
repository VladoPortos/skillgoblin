import { defineEventHandler, setResponseHeader } from 'h3';
import { readBranding } from '../utils/branding.js';

// Dynamic PWA manifest. Replaces the static frontend/public/site.webmanifest
// so operator branding (name, theme color, etc.) flows through to the
// install prompt and home-screen icon label without a rebuild. Icons stay
// bundled (out of scope for env-driven customization — they need a build
// step to generate the right sizes from a single source asset).
export default defineEventHandler((event) => {
  const b = readBranding();
  setResponseHeader(event, 'Content-Type', 'application/manifest+json');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return {
    name: b.name,
    short_name: b.shortName,
    description: b.description,
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    theme_color: b.themeColor,
    background_color: b.backgroundColor,
    display: 'standalone'
  };
});
