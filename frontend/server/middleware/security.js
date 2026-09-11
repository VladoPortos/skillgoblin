import { createError, defineEventHandler, setResponseHeader } from 'h3';
import { isSecureRequest } from '../utils/requestSecurity.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Nuxt's SPA shell emits an inline import map and runtime-config bootstrap.
  // Nonces are not available in this static shell, so permit inline scripts
  // while still excluding eval and every external script origin.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'self' blob:"
].join('; ');

function rejectCrossOriginBrowserRequest(event) {
  const method = (event.node.req.method || 'GET').toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return;

  const origin = event.node.req.headers.origin;
  const fetchSite = String(event.node.req.headers['sec-fetch-site'] || '').toLowerCase();
  if (!origin) {
    // curl, mobile clients and health tooling generally send neither header.
    // Modern browsers send Sec-Fetch-Site even when Origin is stripped.
    if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
      throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' });
    }
    return;
  }

  const host = event.node.req.headers.host;
  if (typeof host !== 'string' || !host) {
    throw createError({ statusCode: 400, statusMessage: 'Host header required' });
  }

  let suppliedOrigin;
  try {
    suppliedOrigin = new URL(Array.isArray(origin) ? origin[0] : origin).origin;
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' });
  }
  const expectedOrigin = `${isSecureRequest(event) ? 'https' : 'http'}://${host}`;
  if (suppliedOrigin !== expectedOrigin) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' });
  }
}

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Content-Security-Policy', CONTENT_SECURITY_POLICY);
  setResponseHeader(event, 'X-Frame-Options', 'DENY');
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff');
  setResponseHeader(event, 'Referrer-Policy', 'same-origin');
  setResponseHeader(event, 'Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  setResponseHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin');
  if (isSecureRequest(event)) {
    // No includeSubDomains/preload: homelab operators may use unrelated HTTP
    // services on sibling names and should not have policy imposed on them.
    setResponseHeader(event, 'Strict-Transport-Security', 'max-age=31536000');
  }

  rejectCrossOriginBrowserRequest(event);
});
