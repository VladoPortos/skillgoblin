import { defineEventHandler, readBody, createError, setCookie } from 'h3';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { createSession } from '../../utils/sessions';
import { sessionCookieOpts, SESSION_COOKIE } from '../../middleware/session';
import { checkRateLimit, recordFailure, recordSuccess, ACCOUNT_FAIL_THRESHOLD } from '../../utils/rate-limit';
import { getClientIp } from '../../utils/requestIp';
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

  // Rate limit like /api/users/auth — this endpoint is unauthenticated and
  // lets a caller claim a credential-less account. Two buckets (per-ip and
  // account-wide) so header-spoofed source addresses can't reset the counter;
  // getClientIp() does not trust X-Forwarded-For unless TRUST_PROXY_HOPS is set.
  const ip = getClientIp(event);
  const ipKey = `bootstrap:${userId}:${ip}`;
  const acctKey = `bootstrap-acct:${userId}`;
  const rlIp = checkRateLimit(ipKey);
  const rlAcct = checkRateLimit(acctKey);
  if (!rlIp.allowed || !rlAcct.allowed) {
    const retryAfterSeconds = Math.max(rlIp.retryAfterSeconds || 0, rlAcct.retryAfterSeconds || 0);
    return createError({
      statusCode: 429,
      statusMessage: `Too many attempts. Try again in ${retryAfterSeconds}s.`
    });
  }
  const recordClaimFailure = () => {
    recordFailure(ipKey);
    recordFailure(acctKey, { threshold: ACCOUNT_FAIL_THRESHOLD });
  };

  const db = getDb();
  const user = db
    .prepare('SELECT id, password, pin, is_active, isAdmin FROM users WHERE id = ?')
    .get(userId);
  if (!user) {
    recordClaimFailure();
    return createError({ statusCode: 404, statusMessage: 'User not found' });
  }
  // An account that already has any credential is handled by the normal
  // sign-in screen — check this first so an admin who already has a password
  // gets the informative 409 rather than the admin-block 403 below.
  if (user.password || user.pin) {
    recordClaimFailure();
    return createError({
      statusCode: 409,
      statusMessage: 'This account already has credentials. Use the normal sign-in screen.'
    });
  }
  // SECURITY: never let this unauthenticated self-claim path grant an admin
  // account. A legacy admin can survive the auth-hardening upgrade with no
  // password and no PIN (is_active defaults to 1); without this guard an
  // anonymous caller who reads the admin's id from the public user list could
  // set a password and seize administrator access. Admin credentials must be
  // (re)set by another admin via the user-management panel. (Reached only for
  // a credential-less admin — the has-credentials case returned 409 above.)
  if (user.isAdmin) {
    recordClaimFailure();
    return createError({
      statusCode: 403,
      statusMessage: 'This account cannot set credentials here; ask an administrator to reset it.'
    });
  }
  if (!user.is_active) {
    recordClaimFailure();
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

  // Atomic claim: only write if the row is STILL credential-less. Two racing
  // requests both pass the checks above and await argon2; the compare-and-swap
  // guarantees exactly one wins. The loser gets 409 and no session, so a
  // credential-less account can never be claimed twice.
  const claim = db
    .prepare(`
      UPDATE users SET password = ?, pin = ?
      WHERE id = ?
        AND (password IS NULL OR password = '')
        AND (pin IS NULL OR pin = '')
    `)
    .run(hashedPassword, hashedPin, userId);
  if (claim.changes !== 1) {
    recordClaimFailure();
    return createError({
      statusCode: 409,
      statusMessage: 'This account already has credentials. Use the normal sign-in screen.'
    });
  }

  const userAgent = event.node.req.headers['user-agent'] || null;
  const { token, expiresAt } = createSession(db, userId, { userAgent });
  setCookie(event, SESSION_COOKIE, token, sessionCookieOpts(event, expiresAt));
  recordSuccess(ipKey);
  recordSuccess(acctKey);

  const refreshed = db
    .prepare('SELECT id, name, avatar, isAdmin, is_active FROM users WHERE id = ?')
    .get(userId);
  return {
    success: true,
    user: refreshed
  };
});
