import { LRUCache } from 'lru-cache';

// Memoize conversions keyed by source-file path + mtime so a re-edited .srt
// invalidates automatically. Bounded by TOTAL bytes, not entry count: a
// handful of very large subtitles must not be able to pin gigabytes in memory.
const MAX_SRT_BYTES = 2 * 1024 * 1024;      // reject subtitles larger than 2 MiB
const MAX_SRT_CACHE_BYTES = 8 * 1024 * 1024; // total conversion-cache budget
const cache = new LRUCache({
  maxSize: MAX_SRT_CACHE_BYTES,
  sizeCalculation: (buf) => buf.length || 1,
});

const TIMESTAMP_RE = /^(\d\d:\d\d:\d\d),(\d{3}) --> (\d\d:\d\d:\d\d),(\d{3})$/;

// Convert an SRT body (string) to a VTT body (string).
// - Strips a leading UTF-8 BOM if present
// - Normalizes CRLF to LF
// - Replaces the comma decimal separator with a period in timestamp lines only
// - Prepends the WEBVTT header
//
// Pure function. No I/O, no caching at this layer (cache lives in `convertSrtFileToVtt`).
export function srtToVtt(srtBody) {
  if (!srtBody) return 'WEBVTT\n\n';
  let body = srtBody.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = body.split('\n').map((line) => {
    const m = line.match(TIMESTAMP_RE);
    if (!m) return line;
    return `${m[1]}.${m[2]} --> ${m[3]}.${m[4]}`;
  });
  return 'WEBVTT\n\n' + lines.join('\n');
}

// Convert from a file path with a per-(path,mtime) memo. Returns a Buffer
// (UTF-8) ready to be written to the response. Throws on read failure so
// the caller can map it to a 404 / 500.
export async function convertSrtFileToVtt(srtFilePath, fs) {
  const stat = await fs.promises.stat(srtFilePath);
  if (stat.size > MAX_SRT_BYTES) {
    const err = new Error(`SRT file exceeds ${MAX_SRT_BYTES}-byte cap: ${stat.size} bytes`);
    err.code = 'ESRTTOOLARGE';
    throw err;
  }
  const key = `${srtFilePath}:${stat.mtimeMs}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const raw = await fs.promises.readFile(srtFilePath, 'utf8');
  const vtt = srtToVtt(raw);
  const buf = Buffer.from(vtt, 'utf8');
  cache.set(key, buf);
  return buf;
}

// Test-only hook so unit tests can clear the cache between runs.
export function _resetSrtCache() {
  cache.clear();
}
