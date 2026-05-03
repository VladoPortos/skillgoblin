import { defineEventHandler, readBody, createError, setCookie, getRequestIP } from 'h3';
import { getDb } from '../../utils/db';
import { verifyCredential, hashCredential } from '../../utils/credentials';
import { createSession } from '../../utils/sessions';
import { sessionCookieOpts, SESSION_COOKIE } from '../../middleware/session';
import { checkRateLimit, recordFailure, recordSuccess } from '../../utils/rate-limit';

// A hash to verify-against when the user/credential lookup misses, so the
// response time of "no such user" / "no password set" matches the time of
// "wrong password". Lazily initialized to keep module load synchronous.
let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = hashCredential('timing-equalizer-' + Math.random().toString(36).slice(2));
  }
  return dummyHashPromise;
}

// POST /api/users/auth — verify a user's credentials and issue a session.
// Body: { userId, password? | pin? }
// Returns: { success: true,  user: { id, name, avatar, isAdmin, is_active } }
//          { success: false, message }
//
// On success: sets the sg_session HttpOnly cookie. Subsequent requests carry
// the cookie automatically and the session middleware (server/middleware/
// session.js) populates event.context.user.
export default defineEventHandler(async (event) => {
  if (event.node.req.method !== 'POST') {
    return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  try {
    const body = await readBody(event);
    const { userId, password, pin } = body || {};

    if (!userId) {
      return createError({ statusCode: 400, statusMessage: 'User ID is required' });
    }

    // Rate limit per (userId, ip). The bucket is shared across password
    // and PIN attempts — five wrong attempts in any combination locks the
    // pair out for a while.
    const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
    const rlKey = `auth:${userId}:${ip}`;
    const rl = checkRateLimit(rlKey);
    if (!rl.allowed) {
      return createError({
        statusCode: 429,
        statusMessage: `Too many failed attempts. Try again in ${rl.retryAfterSeconds}s.`
      });
    }

    const db = getDb();
    const user = db
      .prepare('SELECT id, name, avatar, password, pin, isAdmin, is_active FROM users WHERE id = ?')
      .get(userId);

    if (!user) {
      // Mirror the response shape AND timing of the "wrong password" path so
      // we don't leak user existence via response shape OR response time.
      await verifyCredential(password || pin || 'x', await getDummyHash());
      recordFailure(rlKey);
      return { success: false, message: 'Invalid credentials' };
    }

    if (!user.is_active) {
      // Intentional shape difference: pending users need to know they exist
      // and are awaiting approval. This leaks existence by design (per the
      // wishlist).
      return {
        success: false,
        message: 'This account is awaiting administrator approval'
      };
    }

    if (!password && !pin) {
      recordFailure(rlKey);
      return { success: false, message: 'Invalid credentials' };
    }

    // Try password first, then PIN. Either match wins, mirroring the
    // pre-existing UX where users with both can use either. We always verify
    // against either the real stored value OR a dummy hash so the response
    // time doesn't reveal which credential the user actually has set.
    let matched = null; // 'password' | 'pin' | null
    let needsRehash = false;

    if (password) {
      const target = user.password || (await getDummyHash());
      const r = await verifyCredential(password, target);
      if (r.ok && user.password) {
        matched = 'password';
        needsRehash = r.needsRehash;
      }
    }

    if (!matched && pin) {
      const target = user.pin || (await getDummyHash());
      const r = await verifyCredential(pin, target);
      if (r.ok && user.pin) {
        matched = 'pin';
        needsRehash = r.needsRehash;
      }
    }

    if (!matched) {
      recordFailure(rlKey);
      return { success: false, message: 'Invalid credentials' };
    }

    // Best-effort inline migration: if the value matched but is still
    // plaintext, rewrite it as an argon2 hash. Failure here must NOT
    // block login — it just means the next login will retry.
    if (needsRehash) {
      try {
        const fresh = await hashCredential(matched === 'password' ? password : pin);
        const column = matched === 'password' ? 'password' : 'pin';
        db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(fresh, userId);
      } catch (err) {
        console.warn(`[auth] inline rehash failed for ${userId}:`, err.message);
      }
    }

    // Issue session.
    const userAgent = event.node.req.headers['user-agent'] || null;
    const { token, expiresAt } = createSession(db, userId, { userAgent });
    setCookie(event, SESSION_COOKIE, token, sessionCookieOpts(event, expiresAt));
    recordSuccess(rlKey);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        isAdmin: user.isAdmin,
        is_active: user.is_active
      }
    };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return createError({ statusCode: 500, statusMessage: 'Authentication failed' });
  }
});
