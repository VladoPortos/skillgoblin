// Lightweight in-memory rate limiter for /api/users/auth.
//
// Tracks consecutive failures per (key) tuple. On the Nth consecutive
// failure the key is locked out for an exponentially growing window. A
// successful login clears the key.
//
// In-memory only: process restart wipes state. That's intentional — we
// don't want a stuck lockout to survive a server restart, and persisting
// this in SQLite would be overkill for a homelab.
//
// Single-process by design. The app runs as one Nitro process per
// container; there's no cluster mode to worry about.

export const FAIL_THRESHOLD = 5;          // first lockout after this many fails in a row
const BASE_LOCKOUT_MS = 30 * 1000; // 30 seconds
const MAX_LOCKOUT_MS = 30 * 60 * 1000; // cap at 30 minutes
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // GC entries that haven't been touched in 24h

// Account-wide threshold (see auth handler). Deliberately higher than the
// per-(user,ip) threshold: it aggregates every IP hitting one account, so it
// must tolerate a few devices fat-fingering a PIN before it engages, while
// still bounding a distributed / IP-rotating brute-force that slips past the
// per-IP bucket.
export const ACCOUNT_FAIL_THRESHOLD = 20;

const buckets = new Map();
let lastGcAt = 0;
const GC_INTERVAL_MS = 5 * 60 * 1000;

function gcIfDue(now) {
  if (now - lastGcAt < GC_INTERVAL_MS) return;
  lastGcAt = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeen > STALE_AFTER_MS) buckets.delete(key);
  }
}

function lockoutDuration(failCount, threshold) {
  if (failCount < threshold) return 0;
  const exp = failCount - threshold;
  const dur = BASE_LOCKOUT_MS * Math.pow(2, exp);
  return Math.min(dur, MAX_LOCKOUT_MS);
}

// Call before processing the credential check. Returns:
//   { allowed: true }
//   { allowed: false, retryAfterSeconds }   if locked out
export function checkRateLimit(key, { now = Date.now() } = {}) {
  gcIfDue(now);
  const b = buckets.get(key);
  if (!b) return { allowed: true };
  b.lastSeen = now;
  if (b.lockedUntil && b.lockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((b.lockedUntil - now) / 1000)
    };
  }
  return { allowed: true };
}

// Call after a failed login attempt. `threshold` lets a caller run a second
// bucket (e.g. account-wide) with a laxer lockout point than the default
// per-(user,ip) bucket.
export function recordFailure(key, { now = Date.now(), threshold = FAIL_THRESHOLD } = {}) {
  gcIfDue(now);
  const b = buckets.get(key) || { failCount: 0, lockedUntil: 0, lastSeen: now };
  b.failCount += 1;
  b.lastSeen = now;
  const dur = lockoutDuration(b.failCount, threshold);
  if (dur > 0) b.lockedUntil = now + dur;
  buckets.set(key, b);
}

// Call after a successful login. Clears the bucket.
export function recordSuccess(key) {
  buckets.delete(key);
}

// Test helper — exported so we can reset between tests without an explicit
// process restart.
export function _resetForTests() {
  buckets.clear();
  lastGcAt = 0;
}
