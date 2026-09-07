import { expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { parseCourseMultipart } from '../../server/utils/courseMultipart.js';
function request(parts) { const req = Readable.from([Buffer.from(parts.map(p => `--x\r\n${p}\r\n`).join('')+'--x--\r\n')]); req.headers={'content-type':'multipart/form-data; boundary=x'}; return req; }
it('accepts the course field', async () => { expect((await parseCourseMultipart(request(['Content-Disposition: form-data; name="course"\r\n\r\n{}']))).fields.course).toBe('{}'); });
it('rejects oversized form fields', async () => { await expect(parseCourseMultipart(request(['Content-Disposition: form-data; name="course"\r\n\r\n'+'x'.repeat(300*1024)]))).rejects.toMatchObject({statusCode:413}); });
it('rejects multiple upload files', async () => { const file='Content-Disposition: form-data; name="thumbnail"; filename="a"\r\nContent-Type: image/png\r\n\r\na'; await expect(parseCourseMultipart(request([file,file]))).rejects.toMatchObject({statusCode:413}); });
it('rejects total chunked input before parsing', async () => { const req=Readable.from([Buffer.alloc(12*1024*1024)]); req.headers={'content-type':'multipart/form-data; boundary=x'}; await expect(parseCourseMultipart(req)).rejects.toMatchObject({statusCode:413}); });

it('accepts one course field and one thumbnail together', async () => {
 const result=await parseCourseMultipart(request(['Content-Disposition: form-data; name="course"\r\n\r\n{}','Content-Disposition: form-data; name="thumbnail"; filename="a"\r\nContent-Type: image/png\r\n\r\na']));expect(result.files.thumbnail.buffer.toString()).toBe('a');
});
it('rejects a file exceeding ten MiB', async () => { await expect(parseCourseMultipart(request(['Content-Disposition: form-data; name="thumbnail"; filename="a"\r\nContent-Type: image/png\r\n\r\n'+'x'.repeat(10*1024*1024+1)]))).rejects.toMatchObject({statusCode:413}); });
