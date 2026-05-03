import crypto from 'node:crypto';

// Cookie + token shape for the session layer. Tokens are 32 random bytes
// emitted as base64url; only the SHA-256 of the token lives in the DB so a
// DB read alone never yields a usable session. We don't need argon2 here —
// the token is high-entropy random, not a user-chosen secret.
//
// Lifetime: 30 days fixed. Sliding refresh on activity, debounced to once
// every 5 minutes so the per-second progress saves a video player generates
// don't write to user_sessions on every request.
//
// The cookie is HttpOnly + SameSite=Lax + Path=/. The Secure flag is set by
// the issuing endpoint based on the request scheme — we cannot detect that
// here.
export const SESSION_COOKIE = 'sg_session';
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_TOUCH_DEBOUNCE_MS = 5 * 60 * 1000;     // 5 minutes
export const SESSION_TOKEN_BYTES = 32;

export function generateSessionToken() {
  return crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// Creates a session row for a user. Returns the *plaintext* token (only here
// in this function and the response we hand to the cookie writer) plus the
// expiry instant in ms-since-epoch.
export function createSession(db, userId, { userAgent = null, now = Date.now() } = {}) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_LIFETIME_MS).toISOString();

  db.prepare(`
    INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, createdAt, expiresAt, createdAt, userAgent);

  return { token, expiresAt: now + SESSION_LIFETIME_MS };
}

// Looks up a session by its plaintext token. Returns the (joined) user row
// plus the session's expiry, or null if the token is unknown / expired.
// Expired rows are deleted opportunistically.
export function findSessionUser(db, token, { now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const tokenHash = hashSessionToken(token);

  const row = db.prepare(`
    SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen_at,
           u.id, u.name, u.avatar, u.isAdmin, u.is_active
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!row) return null;

  const expiresAtMs = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }

  return {
    tokenHash: row.token_hash,
    expiresAt: expiresAtMs,
    lastSeenAt: Date.parse(row.last_seen_at),
    user: {
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      isAdmin: row.isAdmin,
      is_active: row.is_active
    }
  };
}

// Sliding refresh — only updates last_seen_at and expires_at if the cached
// session row hasn't been touched in SESSION_TOUCH_DEBOUNCE_MS. Returns the
// new expiry (so the caller can extend the cookie's Max-Age) or null if no
// refresh happened.
export function touchSession(db, sessionRow, { now = Date.now() } = {}) {
  if (!sessionRow?.tokenHash) return null;
  if (now - (sessionRow.lastSeenAt ?? 0) < SESSION_TOUCH_DEBOUNCE_MS) return null;

  const newLastSeen = new Date(now).toISOString();
  const newExpiry = new Date(now + SESSION_LIFETIME_MS).toISOString();
  db.prepare(`
    UPDATE user_sessions
    SET last_seen_at = ?, expires_at = ?
    WHERE token_hash = ?
  `).run(newLastSeen, newExpiry, sessionRow.tokenHash);

  return now + SESSION_LIFETIME_MS;
}

// Deletes a single session by its plaintext token (logout from this device).
export function deleteSessionByToken(db, token) {
  if (typeof token !== 'string' || token.length === 0) return 0;
  const tokenHash = hashSessionToken(token);
  return db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(tokenHash).changes;
}

// Wipes every session for a user (e.g. password change → log everyone else
// out; admin "kick"). Returns the number of rows removed. If `exceptToken`
// is given, that one stays — useful for "log out other devices but keep me
// here".
export function deleteUserSessions(db, userId, { exceptToken = null } = {}) {
  if (exceptToken) {
    const exceptHash = hashSessionToken(exceptToken);
    return db.prepare(
      `DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?`
    ).run(userId, exceptHash).changes;
  }
  return db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId).changes;
}

// Periodic cleanup helper. Not currently scheduled — the find path also
// drops expired rows opportunistically — but useful for tests and for any
// future cron/cleanup job.
export function pruneExpiredSessions(db, { now = Date.now() } = {}) {
  const nowIso = new Date(now).toISOString();
  return db.prepare(`DELETE FROM user_sessions WHERE expires_at <= ?`).run(nowIso).changes;
}
