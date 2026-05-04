import { describe, it, expect } from 'vitest';
import { parseNewBadgeDays, isWithinNewWindow } from '../../server/utils/recencyHelpers.js';

describe('parseNewBadgeDays', () => {
  it('returns 7 by default when env is missing', () => {
    expect(parseNewBadgeDays(undefined)).toBe(7);
    expect(parseNewBadgeDays('')).toBe(7);
  });

  it('parses a positive integer', () => {
    expect(parseNewBadgeDays('14')).toBe(14);
  });

  it('returns 0 when the env value is "0" (badge disabled)', () => {
    expect(parseNewBadgeDays('0')).toBe(0);
  });

  it('returns 7 when the env value is invalid', () => {
    expect(parseNewBadgeDays('abc')).toBe(7);
    expect(parseNewBadgeDays('-5')).toBe(7);
    expect(parseNewBadgeDays('3.5')).toBe(7);
  });
});

describe('isWithinNewWindow', () => {
  const now = new Date('2026-05-04T12:00:00Z').getTime();

  it('returns true for a row created 1 day ago with a 7-day window', () => {
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(oneDayAgo, 7, now)).toBe(true);
  });

  it('returns false for a row created 30 days ago with a 7-day window', () => {
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(thirtyDaysAgo, 7, now)).toBe(false);
  });

  it('returns false when the window is 0 (badge disabled)', () => {
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(oneDayAgo, 0, now)).toBe(false);
  });

  it('returns false when createdAt is null or undefined', () => {
    expect(isWithinNewWindow(null, 7, now)).toBe(false);
    expect(isWithinNewWindow(undefined, 7, now)).toBe(false);
  });

  it('returns false when createdAt is unparseable', () => {
    expect(isWithinNewWindow('not a date', 7, now)).toBe(false);
  });

  it('handles SQLite "YYYY-MM-DD HH:MM:SS" format (no T separator)', () => {
    const sqliteFormat = '2026-05-03 12:00:00';
    expect(isWithinNewWindow(sqliteFormat, 7, now)).toBe(true);
  });
});
