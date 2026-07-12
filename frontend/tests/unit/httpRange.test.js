import { describe, it, expect } from 'vitest';
import { parseSingleByteRange } from '../../server/utils/httpRange.js';

describe('parseSingleByteRange', () => {
  it('parses bounded and open-ended ranges', () => {
    expect(parseSingleByteRange('bytes=10-19', 100, 2_000_000)).toEqual({ start: 10, end: 19 });
    expect(parseSingleByteRange('bytes=90-', 100, 2_000_000)).toEqual({ start: 90, end: 99 });
  });

  it('parses suffix ranges', () => {
    expect(parseSingleByteRange('bytes=-20', 100, 2_000_000)).toEqual({ start: 80, end: 99 });
    expect(parseSingleByteRange('bytes=-200', 100, 2_000_000)).toEqual({ start: 0, end: 99 });
  });

  it('keeps a capped suffix range anchored to the end of the file', () => {
    expect(parseSingleByteRange('bytes=-200', 1_000, 100)).toEqual({ start: 900, end: 999 });
  });

  it('caps a response to the configured chunk size', () => {
    expect(parseSingleByteRange('bytes=10-90', 100, 16)).toEqual({ start: 10, end: 25 });
  });

  it.each([
    null,
    '',
    'items=0-1',
    'bytes=-',
    'bytes=10-1',
    'bytes=100-120',
    'bytes=0-1,4-5',
    'bytes=abc-def',
  ])('rejects invalid or unsupported range %j', (header) => {
    expect(parseSingleByteRange(header, 100, 16)).toBeNull();
  });
});
