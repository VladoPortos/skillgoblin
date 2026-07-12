export function parseSingleByteRange(header, size, maxChunkSize) {
  if (typeof header !== 'string' || !Number.isSafeInteger(size) || size <= 0) return null;
  if (!Number.isSafeInteger(maxChunkSize) || maxChunkSize <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start;
  let requestedEnd;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - Math.min(suffixLength, maxChunkSize));
    requestedEnd = size - 1;
  } else {
    start = Number(match[1]);
    requestedEnd = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) return null;

  return {
    start,
    end: Math.min(requestedEnd, start + maxChunkSize - 1, size - 1),
  };
}
