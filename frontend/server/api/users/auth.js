import { getDb } from '../../utils/db';
import { defineEventHandler, readBody, createError } from 'h3';
import { verifyCredential, hashCredential } from '../../utils/credentials';

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

// POST /api/users/auth — verify a user's credentials.
// Body: { userId, password? | pin? }
// Returns: { success: true }                          on success
//          { success: false, message }                on bad creds / inactive
//
// Phase 1 scope: argon2id verify with inline-on-read rehash for legacy
// plaintext rows. Session cookie issuance lands in Phase 2 — this handler
// still just returns {success}; the existing localStorage-based "login"
// continues to work in the meantime.
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

    const db = getDb();
    const user = db
      .prepare('SELECT id, password, pin, is_active FROM users WHERE id = ?')
      .get(userId);

    if (!user) {
      // Mirror the response shape AND timing of the "wrong password" path so
      // we don't leak user existence via response shape OR response time.
      // We do a real argon2.verify against a dummy hash before returning.
      await verifyCredential(password || pin || 'x', await getDummyHash());
      return { success: false, message: 'Invalid credentials' };
    }

    if (!user.is_active) {
      return {
        success: false,
        message: 'This account is awaiting administrator approval'
      };
    }

    if (!password && !pin) {
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

    return { success: true };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return createError({ statusCode: 500, statusMessage: 'Authentication failed' });
  }
});
