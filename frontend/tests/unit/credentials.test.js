import { describe, it, expect } from 'vitest';
import { hashCredential, verifyCredential, looksHashed } from '../../server/utils/credentials.js';

describe('looksHashed', () => {
  it('recognizes argon2id PHC strings', () => {
    expect(looksHashed('$argon2id$v=19$m=19456,t=2,p=1$abc$def')).toBe(true);
  });

  it('rejects plaintext, empty strings, non-strings', () => {
    expect(looksHashed('hunter2')).toBe(false);
    expect(looksHashed('')).toBe(false);
    expect(looksHashed(null)).toBe(false);
    expect(looksHashed(undefined)).toBe(false);
    expect(looksHashed(1234)).toBe(false);
  });

  it('rejects argon2i / argon2d (only argon2id is accepted as the canonical form)', () => {
    expect(looksHashed('$argon2i$v=19$m=4096,t=3,p=1$abc$def')).toBe(false);
    expect(looksHashed('$argon2d$v=19$m=4096,t=3,p=1$abc$def')).toBe(false);
  });
});

describe('hashCredential', () => {
  it('produces an argon2id PHC string for non-empty input', async () => {
    const h = await hashCredential('hunter2');
    expect(typeof h).toBe('string');
    expect(looksHashed(h)).toBe(true);
  });

  it('rejects empty / non-string input', async () => {
    await expect(hashCredential('')).rejects.toThrow(/non-empty/);
    await expect(hashCredential(null)).rejects.toThrow(/non-empty/);
    await expect(hashCredential(undefined)).rejects.toThrow(/non-empty/);
    await expect(hashCredential(1234)).rejects.toThrow(/non-empty/);
  });

  it('uses a fresh salt per call (same input → different hash)', async () => {
    const a = await hashCredential('hunter2');
    const b = await hashCredential('hunter2');
    expect(a).not.toBe(b);
  });
});

describe('verifyCredential — hashed path', () => {
  it('accepts the right plaintext', async () => {
    const stored = await hashCredential('hunter2');
    const r = await verifyCredential('hunter2', stored);
    expect(r).toEqual({ ok: true, needsRehash: false });
  });

  it('rejects the wrong plaintext', async () => {
    const stored = await hashCredential('hunter2');
    const r = await verifyCredential('hunter3', stored);
    expect(r).toEqual({ ok: false, needsRehash: false });
  });

  it('returns {ok:false} for malformed stored hash without throwing', async () => {
    const r = await verifyCredential('anything', '$argon2id$not-a-real-hash');
    expect(r.ok).toBe(false);
    expect(r.needsRehash).toBe(false);
  });
});

describe('verifyCredential — legacy plaintext path', () => {
  it('accepts a matching plaintext stored value and signals rehash needed', async () => {
    const r = await verifyCredential('hunter2', 'hunter2');
    expect(r).toEqual({ ok: true, needsRehash: true });
  });

  it('rejects a mismatched plaintext stored value', async () => {
    const r = await verifyCredential('hunter2', 'hunter3');
    expect(r).toEqual({ ok: false, needsRehash: false });
  });

  it('rejects empty / null / undefined inputs without throwing', async () => {
    expect(await verifyCredential('', 'hunter2')).toEqual({ ok: false, needsRehash: false });
    expect(await verifyCredential(null, 'hunter2')).toEqual({ ok: false, needsRehash: false });
    expect(await verifyCredential('hunter2', '')).toEqual({ ok: false, needsRehash: false });
    expect(await verifyCredential('hunter2', null)).toEqual({ ok: false, needsRehash: false });
  });

  it('matches PINs (numeric strings) the same way as passwords', async () => {
    const stored = await hashCredential('1234');
    expect((await verifyCredential('1234', stored)).ok).toBe(true);
    expect((await verifyCredential('4321', stored)).ok).toBe(false);
  });
});
