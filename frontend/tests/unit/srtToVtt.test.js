import { describe, it, expect } from 'vitest';
import { srtToVtt } from '../../server/utils/srtToVtt.js';

describe('srtToVtt', () => {
  it('converts a basic two-cue SRT to VTT', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:04,000',
      'Hello world',
      '',
      '2',
      '00:00:05,500 --> 00:00:08,250',
      'Second cue',
      '',
    ].join('\n');

    const vtt = srtToVtt(srt);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
    expect(vtt).toContain('00:00:05.500 --> 00:00:08.250');
    expect(vtt).toContain('Hello world');
    expect(vtt).toContain('Second cue');
  });

  it('returns just the WEBVTT header for empty input', () => {
    expect(srtToVtt('')).toBe('WEBVTT\n\n');
  });

  it('strips a UTF-8 BOM if present', () => {
    const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nA\n';
    const vtt = srtToVtt(srt);
    expect(vtt.charCodeAt(0)).toBe(0x57); // 'W' from WEBVTT, not BOM
  });

  it('normalizes CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n';
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
    expect(vtt).toContain('A');
    expect(vtt).not.toContain('\r');
  });

  it('only replaces commas inside timestamp lines, not in cue text', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Hello, world',
      '',
    ].join('\n');
    const vtt = srtToVtt(srt);
    expect(vtt).toContain('Hello, world'); // comma in text is preserved
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
  });
});
