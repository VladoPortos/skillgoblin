import { defineEventHandler, readBody, createError, setCookie } from 'h3';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { createSession } from '../../utils/sessions';
import { sessionCookieOpts, SESSION_COOKIE } from '../../middleware/session';

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

  const db = getDb();
  const user = db
    .prepare('SELECT id, password, pin, is_active FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    return createError({ statusCode: 404, statusMessage: 'User not found' });
  }
  if (user.password || user.pin) {
    return createError({
      statusCode: 409,
      statusMessage: 'This account already has credentials. Use the normal sign-in screen.'
    });
  }
  if (!user.is_active) {
    return createError({
      statusCode: 403,
      statusMessage: 'This account is awaiting administrator approval'
    });
  }

  const allowPinRow = db
    .prepare("SELECT value FROM system_settings WHERE key = 'allow_pin'")
    .get();
  const allowPin = (allowPinRow?.value ?? 'true') === 'true';

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

  const refreshed = db
    .prepare('SELECT id, name, avatar, isAdmin, is_active FROM users WHERE id = ?')
    .get(userId);
  return {
    success: true,
    user: refreshed
  };
});
