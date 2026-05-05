// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CC_KEY,
  RATE_KEY,
  getCcDefault,
  setCcDefault,
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('CC default', () => {
  it('returns false when key is missing', () => {
    expect(getCcDefault()).toBe(false);
  });
  it('round-trips a true value', () => {
    setCcDefault(true);
    expect(window.localStorage.getItem(CC_KEY)).toBe('1');
    expect(getCcDefault()).toBe(true);
  });
  it('round-trips a false value', () => {
    setCcDefault(false);
    expect(window.localStorage.getItem(CC_KEY)).toBe('0');
    expect(getCcDefault()).toBe(false);
  });
});

describe('playback rate', () => {
  it('returns 1 when key is missing', () => {
    expect(getPlaybackRate()).toBe(1);
  });
  it('round-trips a valid rate', () => {
    setPlaybackRate(1.5);
    expect(window.localStorage.getItem(RATE_KEY)).toBe('1.5');
    expect(getPlaybackRate()).toBe(1.5);
  });
  it('returns 1 for invalid stored values', () => {
    window.localStorage.setItem(RATE_KEY, 'not-a-number');
    expect(getPlaybackRate()).toBe(1);
    window.localStorage.setItem(RATE_KEY, '99');
    expect(getPlaybackRate()).toBe(1);
  });
  it('rejects out-of-allowlist values silently in setter', () => {
    setPlaybackRate(99);
    expect(window.localStorage.getItem(RATE_KEY)).toBeNull();
  });
});
