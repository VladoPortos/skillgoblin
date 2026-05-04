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

  it('treats SQLite timestamps as UTC, not local time (regression for TZ regex bug)', () => {
    // 6 days, 23 hours before `now`. With UTC parsing this is inside a 7-day
    // window. If the helper accidentally parsed it as local time on a host
    // with a non-UTC offset, the result could flip — this asserts the
    // append-Z-when-no-TZ behavior survives.
    const sqlite = new Date(now - (7 * 24 * 60 * 60 * 1000) + 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '');
    expect(isWithinNewWindow(sqlite, 7, now)).toBe(true);
  });

  it('honors an explicit Z timezone designator (no double-Z appended)', () => {
    const iso = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // ends with .000Z
    expect(iso).toMatch(/Z$/);
    expect(isWithinNewWindow(iso, 7, now)).toBe(true);
  });

  it('honors an explicit +HH:MM timezone designator', () => {
    // 1 hour before `now` expressed in +02:00 offset.
    const oneHourAgoUtc = now - 60 * 60 * 1000;
    const d = new Date(oneHourAgoUtc);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String((d.getUTCHours() + 2) % 24).padStart(2, '0');
    const MM = String(d.getUTCMinutes()).padStart(2, '0');
    const SS = String(d.getUTCSeconds()).padStart(2, '0');
    const withOffset = `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}+02:00`;
    expect(isWithinNewWindow(withOffset, 7, now)).toBe(true);
  });

  it('returns false when ageMs is negative (createdAt in the future)', () => {
    const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinNewWindow(future, 7, now)).toBe(false);
  });
});
