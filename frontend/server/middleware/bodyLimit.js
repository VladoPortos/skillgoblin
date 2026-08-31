import { defineEventHandler, createError } from 'h3';

// Global request-body size guard.
//
// SECURITY: h3's readBody()/readRawBody() buffer every chunk into memory with
// no byte cap. An unauthenticated caller (auth, bootstrap-credentials, signup
// all read the body before doing anything else) could stream a multi-gigabyte
// body — via a large Content-Length or a lying/omitted length with
// Transfer-Encoding: chunked — and exhaust the process.
//
// We cap it here, before any handler runs. For non-multipart requests we read
// the raw stream ourselves with a hard byte ceiling and cache the result on
// req.rawBody, which h3's readRawBody() reuses (see its _rawBody lookup) so the
// downstream handler's readBody() does not re-read a now-consumed stream.
//
// Multipart uploads are intentionally skipped: the upload handler
// (courses/edit.post.js) pipes the raw stream into busboy itself and enforces
// its own per-file limit, so buffering here would starve it.
const MAX_BODY_BYTES = 256 * 1024; // 256 KiB — JSON APIs here are tiny
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export default defineEventHandler(async (event) => {
  const req = event.node.req;
  const method = (req.method || 'GET').toUpperCase();
  if (!BODY_METHODS.has(method)) return;

  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) return;

  // Reject an oversized declared length before reading a single byte.
  const declared = Number.parseInt(req.headers['content-length'] || '', 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request body too large' });
  }

  // Nothing to read (no length, not chunked) — mirror h3's own guard.
  const isChunked = /\bchunked\b/i.test(String(req.headers['transfer-encoding'] || ''));
  if (!declared && !isChunked) return;

  // Already buffered by something upstream — don't double-read.
  if (req.rawBody || req.body) return;

  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const cleanup = () => {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const onData = (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        cleanup();
        req.destroy();
        reject(createError({ statusCode: 413, statusMessage: 'Request body too large' }));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    const onError = (err) => { cleanup(); reject(err); };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });

  // Cache for h3's readRawBody() (checks event.node.req.rawBody).
  req.rawBody = body;
});
