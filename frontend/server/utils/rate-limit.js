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

export const AUTH_REQUEST_LIMIT = 20;
export const AUTH_REQUEST_WINDOW_MS = 60 * 1000;
export const REGISTRATION_REQUEST_LIMIT = 5;
export const REGISTRATION_REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const CREDENTIAL_BOOTSTRAP_REQUEST_LIMIT = 10;
export const CREDENTIAL_BOOTSTRAP_REQUEST_WINDOW_MS = 60 * 1000;

const buckets = new Map();
const requestBuckets = new Map();
let lastGcAt = 0;
const GC_INTERVAL_MS = 5 * 60 * 1000;

export function configuredRequestLimit(envName, fallback) {
  const raw = process.env[envName];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function gcIfDue(now) {
  if (now - lastGcAt < GC_INTERVAL_MS) return;
  lastGcAt = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeen > STALE_AFTER_MS) buckets.delete(key);
  }
  for (const [key, bucket] of requestBuckets) {
    if (bucket.windowEndsAt <= now) requestBuckets.delete(key);
  }
}

// Fixed-window request budget for endpoints where every attempt is costly
// (Argon2 verification/hashing) or creates durable state. Unlike the failure
// limiter below, a successful request does not reset this budget.
export function consumeRequestLimit(key, { limit, windowMs, now = Date.now() } = {}) {
  gcIfDue(now);
  if (!Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError('A positive integer limit and windowMs are required');
  }

  let bucket = requestBuckets.get(key);
  if (!bucket || bucket.windowEndsAt <= now) {
    bucket = { count: 0, windowEndsAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    requestBuckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowEndsAt - now) / 1000))
    };
  }

  bucket.count += 1;
  requestBuckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.count };
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

// Call after a failed login attempt. `threshold` allows endpoint-specific
// lockout points while keeping every bucket tied to a client address.
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
  requestBuckets.clear();
  lastGcAt = 0;
}
