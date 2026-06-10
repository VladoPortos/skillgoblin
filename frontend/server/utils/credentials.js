import argon2 from 'argon2';
import crypto from 'crypto';

// Single source of truth for credential hashing.
//
// Format: argon2id PHC strings (start with `$argon2id$`). Anything that
// does NOT start with that prefix is treated as legacy plaintext and
// triggers an inline-on-read rehash from the auth handler.
//
// This module is async-only on purpose — argon2 itself is async, and we
// don't want to expose a synchronous shim that lies about timing.

const ARGON2_OPTS = {
  type: argon2.argon2id,
  // Modest defaults: server-side single-tenant homelab tool, not a public
  // identity provider. ~50ms on commodity hardware. Tune up if hardware
  // gets faster or if we ship to a wider audience.
  memoryCost: 19 * 1024,   // 19 MiB
  timeCost: 2,
  parallelism: 1
};

const PHC_PREFIX = '$argon2id$';

export function looksHashed(value) {
  return typeof value === 'string' && value.startsWith(PHC_PREFIX);
}

export async function hashCredential(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('hashCredential requires a non-empty string');
  }
  return argon2.hash(plaintext, ARGON2_OPTS);
}

// Verifies a presented plaintext against a stored value.
// Returns:
//   { ok: true,  needsRehash: false } — stored is a valid argon2 hash and matched
//   { ok: true,  needsRehash: true  } — stored is legacy plaintext that matched; caller MUST rehash
//   { ok: false, needsRehash: false } — no match
//
// We do NOT throw on bad credentials. Callers decide how to respond.
export async function verifyCredential(plaintext, stored) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    return { ok: false, needsRehash: false };
  }
  if (typeof stored !== 'string' || stored.length === 0) {
    return { ok: false, needsRehash: false };
  }

  if (looksHashed(stored)) {
    try {
      const ok = await argon2.verify(stored, plaintext);
      return { ok, needsRehash: false };
    } catch {
      return { ok: false, needsRehash: false };
    }
  }

  // Legacy plaintext path. Constant-time compare via Buffer comparison —
  // not perfect under multi-length inputs, but the caller has rate limits
  // on the auth endpoint anyway, and this code path will go away after
  // every user has logged in once post-upgrade.
  const a = Buffer.from(plaintext, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok: same, needsRehash: same };
}
