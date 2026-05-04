const DEFAULT_DAYS = 7;

// Read NEW_BADGE_DAYS from process.env via this helper so the parsing is
// centralized and testable. Accepts a string (or undefined) and returns a
// non-negative integer. Invalid / negative / fractional inputs fall back to
// DEFAULT_DAYS so a misconfigured env var doesn't silently disable the badge.
export function parseNewBadgeDays(raw) {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DAYS;
  if (!/^\d+$/.test(String(raw))) return DEFAULT_DAYS;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return DEFAULT_DAYS;
  return n;
}

// Returns true iff `createdAt` (an ISO-ish or SQLite-format string) is
// within `days` days of `now` (a millisecond timestamp). `now` is injectable
// so unit tests are deterministic.
//
// Timezone handling: SQLite's CURRENT_TIMESTAMP is UTC but emitted as
// "YYYY-MM-DD HH:MM:SS" with no zone designator. We append 'Z' whenever the
// string lacks an explicit timezone (Z, +HH:MM, -HH:MM, +HHMM, -HHMM); strings
// already carrying one are passed through unchanged.
const HAS_TZ_DESIGNATOR = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export function isWithinNewWindow(createdAt, days, now = Date.now()) {
  if (!createdAt) return false;
  if (!days || days <= 0) return false;
  const normalized = typeof createdAt === 'string'
    ? createdAt.replace(' ', 'T') + (HAS_TZ_DESIGNATOR.test(createdAt) ? '' : 'Z')
    : createdAt;
  const ts = new Date(normalized).getTime();
  if (Number.isNaN(ts)) return false;
  const ageMs = now - ts;
  if (ageMs < 0) return false;
  return ageMs < days * 24 * 60 * 60 * 1000;
}
