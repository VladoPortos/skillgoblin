// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RATE_KEY,
  getPlaybackRate,
  setPlaybackRate,
} from '../../utils/playerPreferences.js';

beforeEach(() => {
  window.localStorage.clear();
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
