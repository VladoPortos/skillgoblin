import { describe, it, expect, vi } from 'vitest';
import { readBranding, validHex, warnInvalidColors } from '../../server/utils/branding.js';

describe('readBranding — defaults', () => {
  it('returns documented defaults when env is empty', () => {
    const b = readBranding({});
    expect(b.name).toBe('SkillGoblin');
    expect(b.shortName).toBe('SkillGoblin');
    expect(b.description).toBe('A streamlined, self-hosted learning platform');
    expect(b.themeColor).toBe('#111827');
    expect(b.backgroundColor).toBe('#111827');
  });

  it('treats whitespace-only env values as unset', () => {
    const b = readBranding({
      APP_NAME: '   ',
      APP_DESCRIPTION: '\t',
      APP_SHORT_NAME: ' '
    });
    expect(b.name).toBe('SkillGoblin');
    expect(b.shortName).toBe('SkillGoblin');
    expect(b.description).toBe('A streamlined, self-hosted learning platform');
  });
});

describe('readBranding — overrides', () => {
  it('uses APP_NAME and falls back shortName to name when shortName unset', () => {
    const b = readBranding({ APP_NAME: 'Mine' });
    expect(b.name).toBe('Mine');
    expect(b.shortName).toBe('Mine');
  });

  it('uses APP_SHORT_NAME independently when set', () => {
    const b = readBranding({ APP_NAME: 'Mine', APP_SHORT_NAME: 'M' });
    expect(b.name).toBe('Mine');
    expect(b.shortName).toBe('M');
  });

  it('uses APP_DESCRIPTION when set', () => {
    const b = readBranding({ APP_DESCRIPTION: 'Custom desc' });
    expect(b.description).toBe('Custom desc');
  });

  it('trims surrounding whitespace from values', () => {
    const b = readBranding({ APP_NAME: '  Padded  ' });
    expect(b.name).toBe('Padded');
  });
});

describe('readBranding — color validation', () => {
  it('accepts 6-digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#aabbcc' }).themeColor).toBe('#aabbcc');
  });

  it('accepts 3-digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#abc' }).themeColor).toBe('#abc');
  });

  it('rejects CSS named colors and falls back to default', () => {
    expect(readBranding({ APP_THEME_COLOR: 'red' }).themeColor).toBe('#111827');
  });

  it('rejects rgb() and falls back to default', () => {
    expect(readBranding({ APP_THEME_COLOR: 'rgb(255,0,0)' }).themeColor).toBe('#111827');
  });

  it('rejects bare hex without #', () => {
    expect(readBranding({ APP_THEME_COLOR: 'aabbcc' }).themeColor).toBe('#111827');
  });

  it('rejects 4 or 5 digit hex', () => {
    expect(readBranding({ APP_THEME_COLOR: '#abcd' }).themeColor).toBe('#111827');
    expect(readBranding({ APP_THEME_COLOR: '#abcde' }).themeColor).toBe('#111827');
  });

  it('applies the same validation to APP_BACKGROUND_COLOR', () => {
    expect(readBranding({ APP_BACKGROUND_COLOR: '#fff' }).backgroundColor).toBe('#fff');
    expect(readBranding({ APP_BACKGROUND_COLOR: 'wat' }).backgroundColor).toBe('#111827');
  });
});

describe('validHex', () => {
  it('returns the trimmed value for valid hex', () => {
    expect(validHex('  #abc  ')).toBe('#abc');
    expect(validHex('#aabbcc')).toBe('#aabbcc');
  });
  it('returns null for invalid', () => {
    expect(validHex('red')).toBe(null);
    expect(validHex('')).toBe(null);
    expect(validHex(undefined)).toBe(null);
    expect(validHex(null)).toBe(null);
    expect(validHex(123)).toBe(null);
  });
});

describe('warnInvalidColors', () => {
  it('warns once for each invalid color env value', () => {
    const log = vi.fn();
    warnInvalidColors({ APP_THEME_COLOR: 'red', APP_BACKGROUND_COLOR: 'blue' }, log);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatch(/APP_THEME_COLOR/);
    expect(log.mock.calls[0][0]).toMatch(/red/);
    expect(log.mock.calls[1][0]).toMatch(/APP_BACKGROUND_COLOR/);
  });

  it('does not warn for valid colors', () => {
    const log = vi.fn();
    warnInvalidColors({ APP_THEME_COLOR: '#abc', APP_BACKGROUND_COLOR: '#aabbcc' }, log);
    expect(log).not.toHaveBeenCalled();
  });

  it('does not warn for unset env values', () => {
    const log = vi.fn();
    warnInvalidColors({}, log);
    expect(log).not.toHaveBeenCalled();
  });
});
