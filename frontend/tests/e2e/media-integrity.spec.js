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

test('a range cached at one path is refreshed when that file is replaced', async ({ request }) => {
  await loginAdmin(request);
  const course = await firstCourse(request);
  const original = fs.readFileSync(VIDEO_PATH);
  const originalStat = fs.statSync(VIDEO_PATH);
  const url = `/api/content/${encodeURIComponent(course.id)}/Lesson%201/01-intro.mp4`;

  try {
    fs.writeFileSync(VIDEO_PATH, Buffer.from('AAAA'));
    const first = await request.get(url, { headers: { range: 'bytes=0-3' } });
    expect(first.status()).toBe(206);
    expect((await first.body()).toString()).toBe('AAAA');

    fs.writeFileSync(VIDEO_PATH, Buffer.from('BBBB'));
    const replacementTime = new Date(Date.now() + 2_000);
    fs.utimesSync(VIDEO_PATH, replacementTime, replacementTime);
    const second = await request.get(url, { headers: { range: 'bytes=0-3' } });
    expect(second.status()).toBe(206);
    expect((await second.body()).toString()).toBe('BBBB');
  } finally {
    fs.writeFileSync(VIDEO_PATH, original);
    fs.utimesSync(VIDEO_PATH, originalStat.atime, originalStat.mtime);
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
