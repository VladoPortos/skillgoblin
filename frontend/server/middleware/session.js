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
// Performance: video byte-range requests to /api/content/[...path] can fire
// dozens of times per minute per active viewer. We skip the session lookup
// for those paths because the content endpoint is unauthenticated anyway
// (course library is public). Static assets get the same skip.
const SKIP_PATH_PREFIXES = [
  '/api/content/',
  '/api/course-thumbnail/',
  '/api/random-banner',
  '/_nuxt/',
  '/favicon',
  '/banners/',
  '/images/',
  '/logos/'
];

export default defineEventHandler(async (event) => {
  const url = event.node.req.url || '';
  for (const prefix of SKIP_PATH_PREFIXES) {
    if (url.startsWith(prefix)) return;
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
  // Direct TLS termination → req.encrypted is true on the underlying socket.
  if (event.node.req.socket?.encrypted) return true;
  // Behind a reverse proxy: trust the standard forwarded header.
  const xfproto = event.node.req.headers['x-forwarded-proto'];
  if (typeof xfproto === 'string' && xfproto.split(',')[0].trim() === 'https') return true;
  return false;
}

// Re-export the defaults that issuing endpoints will need.
export { SESSION_COOKIE, SESSION_LIFETIME_MS };
