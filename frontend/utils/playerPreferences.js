export const CC_KEY = 'skillgoblin:cc:default';
export const RATE_KEY = 'skillgoblin:playbackRate';

const ALLOWED_RATES = new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

function safeStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getCcDefault() {
  const s = safeStorage();
  if (!s) return false;
  return s.getItem(CC_KEY) === '1';
}

export function setCcDefault(value) {
  const s = safeStorage();
  if (!s) return;
  s.setItem(CC_KEY, value ? '1' : '0');
}

export function getPlaybackRate() {
  const s = safeStorage();
  if (!s) return 1;
  const raw = s.getItem(RATE_KEY);
  if (raw == null) return 1;
  const n = Number(raw);
  if (Number.isNaN(n) || !ALLOWED_RATES.has(n)) return 1;
  return n;
}

export function setPlaybackRate(value) {
  const s = safeStorage();
  if (!s) return;
  if (!ALLOWED_RATES.has(Number(value))) return;
  s.setItem(RATE_KEY, String(value));
}
