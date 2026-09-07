import busboy from 'busboy';
import { Transform } from 'node:stream';

export const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;
const tooLarge = () => Object.assign(new Error('Upload exceeds request limits'), { statusCode: 413 });

// Bound total bytes as well as individual parts, including chunked requests.
export function parseCourseMultipart(req) {
  if (Number(req.headers['content-length']) > MAX_MULTIPART_BYTES) return Promise.reject(tooLarge());
  return new Promise((resolve, reject) => {
    let total = 0;
    const limiter = new Transform({ transform(chunk, encoding, callback) {
      total += chunk.length;
      callback(total > MAX_MULTIPART_BYTES ? tooLarge() : null, chunk);
    }});
    const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, parts: 3, fieldSize: 256 * 1024 } });
    const result = { fields: {}, files: {} };
    let failed = false;
    const fail = (error) => {
      if (failed) return;
      failed = true;
      req.unpipe(limiter); limiter.unpipe(bb);
      limiter.destroy(); bb.destroy(); req.resume();
      reject(error);
    };
    limiter.on('error', fail); bb.on('error', fail); req.on('error', fail);
    req.on('aborted', () => fail(new Error('Upload aborted')));
    for (const name of ['filesLimit', 'fieldsLimit', 'partsLimit']) bb.on(name, () => fail(tooLarge()));
    bb.on('field', (name, value, info) => {
      if (info.valueTruncated || info.nameTruncated) return fail(tooLarge());
      if (name !== 'course') return fail(Object.assign(new Error('Unexpected upload field'), { statusCode: 400 }));
      result.fields[name] = value;
    });
    bb.on('file', (name, file, info) => {
      const chunks = [];
      file.on('error', fail);
      file.on('limit', () => fail(tooLarge()));
      file.on('data', chunk => { if (!failed) chunks.push(chunk); });
      file.on('end', () => { if (!failed) result.files[name] = { buffer: Buffer.concat(chunks), info }; });
      if (name !== 'thumbnail') fail(Object.assign(new Error('Unexpected upload file'), { statusCode: 400 }));
    });
    bb.on('close', () => { if (!failed) resolve(result); });
    req.pipe(limiter).pipe(bb);
  });
}
