import { defineEventHandler, deleteCookie } from 'h3';
import { getDb } from '../../utils/db';
import { deleteSessionByToken } from '../../utils/sessions';
import { SESSION_COOKIE } from '../../middleware/session';

// POST /api/users/logout — drops the session row and clears the cookie.
// Idempotent: a request without a session still returns success and
// clears the cookie defensively. Returns 200 in all cases so a stale
// client that already lost its session can still complete the flow.
export default defineEventHandler((event) => {
  const token = event.context.sessionToken;
  if (token) {
    try {
      deleteSessionByToken(getDb(), token);
    } catch (err) {
      console.warn('[logout] session delete failed:', err.message);
    }
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
  return { success: true };
});
