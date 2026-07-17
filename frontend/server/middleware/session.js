import { defineEventHandler, getCookie, setCookie, deleteCookie } from 'h3';
import { getDb } from '../utils/db';
import {
  SESSION_COOKIE,
  SESSION_LIFETIME_MS,
  findSessionUser,
  touchSession
} from '../utils/sessions';

// Session middleware. Runs on every request. If the session cookie is
// present and valid, populates `event.context.user` with the user row.
// Otherwise leaves the context untouched — handlers decide whether to
// require auth via the helpers in utils/authz.js.
//
// On valid session: opportunistic sliding refresh via touchSession() (no-op
// if last_seen_at is fresher than the debounce window); refreshed expiry
// is reflected back into the cookie's Max-Age so the browser keeps the
// session alive.
//
// On invalid / expired session: the cookie is cleared so the browser
// stops sending it, sparing future requests an unnecessary DB roundtrip.
//
// Public branding endpoints (/api/logo, /api/login-banner, /api/webmanifest)
// also live here. They emit Cache-Control: public, max-age=300, so a session
// refresh on the same response would mix Set-Cookie with a publicly-cacheable
// payload — unsafe behind any shared cache/CDN that could serve another
// user's cookie. Skipping the middleware keeps those responses cookie-free.
// Public API endpoints — matched EXACTLY (a trailing query string is allowed).
// Using exact match, not startsWith, so a future route such as
// /api/logo-uploader can never silently inherit this auth-skip.
const SKIP_EXACT = new Set([
  '/api/random-banner',
  '/api/logo',
  '/api/login-banner',
  '/api/webmanifest'
]);

// Static asset directories — genuine prefixes (they name a path segment).
const SKIP_PREFIXES = [
  '/_nuxt/',
  '/banners/',
  '/images/',
  '/logos/',
  '/favicon'
];

export default defineEventHandler(async (event) => {
  const pathname = (event.node.req.url || '').split('?')[0];
  if (SKIP_EXACT.has(pathname)) return;
  for (const prefix of SKIP_PREFIXES) {
    if (pathname.startsWith(prefix)) return;
  }

  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return;

  const db = getDb();
  const session = findSessionUser(db, token);

  if (!session) {
    // Stale or unknown token — wipe it from the browser.
    deleteCookie(event, SESSION_COOKIE, { path: '/' });
    return;
  }

  event.context.user = session.user;
  event.context.sessionToken = token;

  const refreshed = touchSession(db, session);
  if (refreshed) {
    setCookie(event, SESSION_COOKIE, token, sessionCookieOpts(event, refreshed));
  }
});

// Helper used both here (refresh) and by /api/users/auth.js (issue) so the
// cookie shape stays in one place.
export function sessionCookieOpts(event, expiresAtMs) {
  const isHttps = isSecureRequest(event);
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isHttps,
    expires: new Date(expiresAtMs),
    maxAge: Math.max(1, Math.floor((expiresAtMs - Date.now()) / 1000))
  };
}

function isSecureRequest(event) {
  // Explicit operator override. A reverse proxy that terminates TLS but does
  // NOT forward X-Forwarded-Proto would otherwise leave the 30-day session
  // cookie without the Secure attribute (eligible to leak over plaintext).
  // COOKIE_SECURE=true forces Secure on; COOKIE_SECURE=false is the escape
  // hatch for an intentional plain-HTTP LAN deployment. Unset/auto keeps the
  // request-scheme detection below so HTTP-LAN logins are not broken by default.
  const override = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;

  // Direct TLS termination → req.encrypted is true on the underlying socket.
  if (event.node.req.socket?.encrypted) return true;
  // Behind a reverse proxy: trust the standard forwarded header.
  const xfproto = event.node.req.headers['x-forwarded-proto'];
  if (typeof xfproto === 'string' && xfproto.split(',')[0].trim() === 'https') return true;
  return false;
}

// Re-export the defaults that issuing endpoints will need.
export { SESSION_COOKIE, SESSION_LIFETIME_MS };
