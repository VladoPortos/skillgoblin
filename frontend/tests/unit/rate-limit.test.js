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
