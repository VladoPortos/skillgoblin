import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { convertSrtFileToVtt, _resetSrtCache } from '../../server/utils/srtToVtt.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-srt-'));
  _resetSrtCache();
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('convertSrtFileToVtt', () => {
  it('reads, converts, and returns a Buffer', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nA\n';
    const file = path.join(tmpDir, 'a.srt');
    fs.writeFileSync(file, srt, 'utf8');
    const buf = await convertSrtFileToVtt(file, fs);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toContain('00:00:01.000 --> 00:00:02.000');
  });

  it('serves cached buffer on the second call when mtime is unchanged', async () => {
    const file = path.join(tmpDir, 'a.srt');
    fs.writeFileSync(file, '1\n00:00:01,000 --> 00:00:02,000\nA\n', 'utf8');
    const a = await convertSrtFileToVtt(file, fs);
    const b = await convertSrtFileToVtt(file, fs);
    expect(b).toBe(a); // identical reference
  });
});
