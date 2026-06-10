export const CC_KEY = 'skillgoblin:cc:default';
export const RATE_KEY = 'skillgoblin:playbackRate';

export const ALLOWED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ALLOWED_RATE_SET = new Set(ALLOWED_RATES);

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
  if (Number.isNaN(n) || !ALLOWED_RATE_SET.has(n)) return 1;
  return n;
}

export function setPlaybackRate(value) {
  const s = safeStorage();
  if (!s) return;
  if (!ALLOWED_RATE_SET.has(Number(value))) return;
  s.setItem(RATE_KEY, String(value));
}
