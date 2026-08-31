import {
  defineEventHandler,
  readBody,
  createError,
  getCookie,
  setCookie,
  deleteCookie
} from 'h3';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { consumeCredentialUpgrade, createSession } from '../../utils/sessions';
import {
  sessionCookieOpts,
  SESSION_COOKIE,
  UPGRADE_COOKIE
} from '../../middleware/session';

// Consumes the PIN-disabled bridge, stores a password, and only then issues
// the normal application session. No other API accepts sg_upgrade.
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {};
  if (typeof body.password !== 'string' || body.password.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Password is required' });
  }

  const token = getCookie(event, UPGRADE_COOKIE);
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Credential upgrade expired' });
  }

  const passwordHash = await hashCredential(body.password);
  const db = getDb();
  const userAgent = event.node.req.headers['user-agent'] || null;
  let session;
  let user;

  const finishUpgrade = db.transaction(() => {
    const userId = consumeCredentialUpgrade(db, token);
    if (!userId) {
      throw createError({ statusCode: 401, statusMessage: 'Credential upgrade expired' });
    }

    const result = db.prepare(`
      UPDATE users SET password = ?
      WHERE id = ? AND is_active = 1 AND (password IS NULL OR password = '')
    `).run(passwordHash, userId);
    if (result.changes !== 1) {
      throw createError({ statusCode: 409, statusMessage: 'Password upgrade is no longer available' });
    }

    session = createSession(db, userId, { userAgent });
    user = db.prepare(`
      SELECT id, name, avatar, isAdmin, is_active,
             CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
             CASE WHEN pin IS NOT NULL AND pin != '' THEN 1 ELSE 0 END AS has_pin
      FROM users WHERE id = ?
    `).get(userId);
  });
  finishUpgrade();

  setCookie(event, SESSION_COOKIE, session.token, sessionCookieOpts(event, session.expiresAt));
  deleteCookie(event, UPGRADE_COOKIE, { path: '/api/users/complete-pin-upgrade' });
  return { success: true, user };
});
