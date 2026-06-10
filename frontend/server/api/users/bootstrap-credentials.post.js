import { defineEventHandler, readBody, createError, setCookie, getRequestIP } from 'h3';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { createSession } from '../../utils/sessions';
import { sessionCookieOpts, SESSION_COOKIE } from '../../middleware/session';
import { checkRateLimit, recordFailure, recordSuccess } from '../../utils/rate-limit';
import { getBoolSetting } from '../../utils/systemSettings';

// POST /api/users/bootstrap-credentials  Body: { userId, password?, pin? }
//
// Lets a *legacy no-credential* user click their profile and set credentials
// in place — same account, just hardened. Server defends against abuse:
//
//   - Refuses if the user already has a password OR a PIN. (If they do,
//     they should be using /api/users/auth.)
//   - Refuses if allow_pin=false and the only credential supplied is a PIN.
//   - Requires at least one of password / PIN.
//
// On success: hashes the credentials, writes them, issues a session
// cookie just like /api/users/auth would.
export default defineEventHandler(async (event) => {
  if (event.node.req.method !== 'POST') {
    return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  const body = (await readBody(event)) || {};
  const { userId } = body;
  const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;
  const pin = typeof body.pin === 'string' && body.pin.length > 0 ? body.pin : null;

  if (!userId) {
    return createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }
  if (!password && !pin) {
    return createError({
      statusCode: 400,
      statusMessage: 'A password or PIN is required'
    });
  }

  // Rate limit per (userId, ip) like /api/users/auth — this endpoint is
  // unauthenticated and lets a caller claim a credential-less account.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  const rlKey = `bootstrap:${userId}:${ip}`;
  const rl = checkRateLimit(rlKey);
  if (!rl.allowed) {
    return createError({
      statusCode: 429,
      statusMessage: `Too many attempts. Try again in ${rl.retryAfterSeconds}s.`
    });
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, password, pin, is_active FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    recordFailure(rlKey);
    return createError({ statusCode: 404, statusMessage: 'User not found' });
  }
  if (user.password || user.pin) {
    recordFailure(rlKey);
    return createError({
      statusCode: 409,
      statusMessage: 'This account already has credentials. Use the normal sign-in screen.'
    });
  }
  if (!user.is_active) {
    recordFailure(rlKey);
    return createError({
      statusCode: 403,
      statusMessage: 'This account is awaiting administrator approval'
    });
  }

  const allowPin = getBoolSetting(db, 'allow_pin', true);

  if (!allowPin && !password) {
    return createError({
      statusCode: 400,
      statusMessage: 'PINs are disabled on this instance — set a password.'
    });
  }

  const hashedPassword = password ? await hashCredential(password) : null;
  const hashedPin = pin && allowPin ? await hashCredential(pin) : null;

  db.prepare(`UPDATE users SET password = ?, pin = ? WHERE id = ?`)
    .run(hashedPassword, hashedPin, userId);

  const userAgent = event.node.req.headers['user-agent'] || null;
  const { token, expiresAt } = createSession(db, userId, { userAgent });
  setCookie(event, SESSION_COOKIE, token, sessionCookieOpts(event, expiresAt));
  recordSuccess(rlKey);

  const refreshed = db
    .prepare('SELECT id, name, avatar, isAdmin, is_active FROM users WHERE id = ?')
    .get(userId);
  return {
    success: true,
    user: refreshed
  };
});
