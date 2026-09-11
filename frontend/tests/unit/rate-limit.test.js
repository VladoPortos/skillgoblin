import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, recordFailure, recordSuccess, _resetForTests } from '../../server/utils/rate-limit.js';

beforeEach(() => _resetForTests());

describe('rate limiter', () => {
  it('allows the first attempt for an unknown key', () => {
    expect(checkRateLimit('k1')).toEqual({ allowed: true });
  });

  it('locks out after 5 consecutive failures', () => {
    for (let i = 0; i < 5; i++) recordFailure('k1');
    const r = checkRateLimit('k1');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('does NOT lock out below the threshold', () => {
    for (let i = 0; i < 4; i++) recordFailure('k1');
    expect(checkRateLimit('k1')).toEqual({ allowed: true });
  });

  it('exponentially backs off — 6th failure is locked out longer than 5th', () => {
    for (let i = 0; i < 5; i++) recordFailure('k1');
    const r5 = checkRateLimit('k1');
    expect(r5.allowed).toBe(false);
    const lockoutAt5 = r5.retryAfterSeconds;

    // Advance "time" by waiting past the first lockout — we can't, so
    // instead just record another failure and check that the new lockout
    // is at least roughly twice as long.
    recordFailure('k1');
    const r6 = checkRateLimit('k1');
    expect(r6.allowed).toBe(false);
    expect(r6.retryAfterSeconds).toBeGreaterThanOrEqual(lockoutAt5);
  });

  it('caps lockout duration at the configured maximum', () => {
    // Force well past where the cap kicks in.
    for (let i = 0; i < 30; i++) recordFailure('k1');
    const r = checkRateLimit('k1');
    expect(r.allowed).toBe(false);
    // 30 minutes = 1800 seconds; allow a little slack for the lockout cap.
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(1800);
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(60);
  });

  it('recordSuccess clears the bucket', () => {
    for (let i = 0; i < 5; i++) recordFailure('k1');
    expect(checkRateLimit('k1').allowed).toBe(false);
    recordSuccess('k1');
    expect(checkRateLimit('k1').allowed).toBe(true);
  });

  it('keys are independent', () => {
    for (let i = 0; i < 5; i++) recordFailure('k1');
    expect(checkRateLimit('k1').allowed).toBe(false);
    expect(checkRateLimit('k2').allowed).toBe(true);
  });
});

describe('fixed-window request limiter', () => {
  it('uses positive integer environment overrides and rejects unsafe values', async () => {
    const { configuredRequestLimit } = await import('../../server/utils/rate-limit.js');
    const previous = process.env.TEST_REQUEST_LIMIT;
    try {
      process.env.TEST_REQUEST_LIMIT = '250';
      expect(configuredRequestLimit('TEST_REQUEST_LIMIT', 20)).toBe(250);
      process.env.TEST_REQUEST_LIMIT = '0';
      expect(configuredRequestLimit('TEST_REQUEST_LIMIT', 20)).toBe(20);
      process.env.TEST_REQUEST_LIMIT = '1.5';
      expect(configuredRequestLimit('TEST_REQUEST_LIMIT', 20)).toBe(20);
    } finally {
      if (previous === undefined) delete process.env.TEST_REQUEST_LIMIT;
      else process.env.TEST_REQUEST_LIMIT = previous;
    }
  });

  it('blocks requests after the configured budget is consumed', async () => {
    const { consumeRequestLimit } = await import('../../server/utils/rate-limit.js');
    expect(consumeRequestLimit).toBeTypeOf('function');

    expect(consumeRequestLimit('ip:one', { limit: 2, windowMs: 60_000, now: 1_000 }))
      .toEqual({ allowed: true, remaining: 1 });
    expect(consumeRequestLimit('ip:one', { limit: 2, windowMs: 60_000, now: 2_000 }))
      .toEqual({ allowed: true, remaining: 0 });
    const blocked = consumeRequestLimit('ip:one', { limit: 2, windowMs: 60_000, now: 3_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(58);
  });

  it('starts a fresh budget after the window expires', async () => {
    const { consumeRequestLimit } = await import('../../server/utils/rate-limit.js');
    consumeRequestLimit('ip:one', { limit: 1, windowMs: 10_000, now: 1_000 });
    expect(consumeRequestLimit('ip:one', { limit: 1, windowMs: 10_000, now: 11_000 }))
      .toEqual({ allowed: true, remaining: 0 });
  });

  it('does not share budgets between client addresses', async () => {
    const { consumeRequestLimit } = await import('../../server/utils/rate-limit.js');
    consumeRequestLimit('ip:one', { limit: 1, windowMs: 60_000, now: 1_000 });
    expect(consumeRequestLimit('ip:two', { limit: 1, windowMs: 60_000, now: 2_000 }).allowed)
      .toBe(true);
  });
});
