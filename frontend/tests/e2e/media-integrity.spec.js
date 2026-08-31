import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';
const VIDEO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'content',
  'Sample Course',
  'Lesson 1',
  '01-intro.mp4',
);

async function loginAdmin(request) {
  const users = await (await request.get('/api/users')).json();
  const admin = users.find(user => user.name === ADMIN_NAME);
  expect(admin).toBeTruthy();
  const response = await request.post('/api/users/auth', {
    data: { userId: admin.id, password: ADMIN_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
}

async function firstCourse(request) {
  const list = await (await request.get('/api/courses?limit=20')).json();
  expect(list.items?.[0]).toBeTruthy();
  return (await request.get(`/api/courses/${list.items[0].id}`)).json();
}

function editMultipart(course, title, thumbnail) {
  return {
    course: JSON.stringify({
      id: course.id,
      title,
      description: course.description,
      category: course.category,
      releaseDate: course.releaseDate,
    }),
    thumbnail,
  };
}

function overwriteOpenFile(fileDescriptor, contents) {
  fs.ftruncateSync(fileDescriptor, 0);
  let offset = 0;
  while (offset < contents.length) {
    offset += fs.writeSync(
      fileDescriptor,
      contents,
      offset,
      contents.length - offset,
      offset,
    );
  }
  fs.fsyncSync(fileDescriptor);
}

test('a range cached at one path is refreshed when that file is replaced', async ({ request }) => {
  await loginAdmin(request);
  const course = await firstCourse(request);
  const videoFile = fs.openSync(VIDEO_PATH, 'r+');
  const original = fs.readFileSync(videoFile);
  const originalStat = fs.fstatSync(videoFile);
  const url = `/api/content/${encodeURIComponent(course.id)}/Lesson%201/01-intro.mp4`;

  try {
    overwriteOpenFile(videoFile, Buffer.from('AAAA'));
    const first = await request.get(url, { headers: { range: 'bytes=0-3' } });
    expect(first.status()).toBe(206);
    expect((await first.body()).toString()).toBe('AAAA');

    overwriteOpenFile(videoFile, Buffer.from('BBBB'));
    const replacementTime = new Date(Date.now() + 2_000);
    fs.futimesSync(videoFile, replacementTime, replacementTime);
    const second = await request.get(url, { headers: { range: 'bytes=0-3' } });
    expect(second.status()).toBe(206);
    expect((await second.body()).toString()).toBe('BBBB');
  } finally {
    try {
      overwriteOpenFile(videoFile, original);
      fs.futimesSync(videoFile, originalStat.atime, originalStat.mtime);
    } finally {
      fs.closeSync(videoFile);
    }
  }
});

test('a corrupt thumbnail is rejected before course metadata changes', async ({ request }) => {
  await loginAdmin(request);
  const course = await firstCourse(request);
  const changedTitle = `${course.title} corrupt-upload`;

  const response = await request.post('/api/courses/edit', {
    multipart: editMultipart(course, changedTitle, {
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    }),
  });

  expect(response.status()).toBe(422);
  const after = await (await request.get(`/api/courses/${course.id}`)).json();
  expect(after.title).toBe(course.title);
});

test('an oversized thumbnail is rejected before course metadata changes', async ({ request }) => {
  await loginAdmin(request);
  const course = await firstCourse(request);
  const changedTitle = `${course.title} oversized-upload`;

  const response = await request.post('/api/courses/edit', {
    multipart: editMultipart(course, changedTitle, {
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x41),
    }),
  });

  expect(response.status()).toBe(413);
  const after = await (await request.get(`/api/courses/${course.id}`)).json();
  expect(after.title).toBe(course.title);
});
