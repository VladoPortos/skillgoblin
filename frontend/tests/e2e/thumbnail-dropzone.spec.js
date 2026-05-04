import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

// PR-B e2e: validates the new dropzone UI in CourseEditor. The dockerized
// test stack mounts `frontend/tests/fixtures/content` at `/app/data/content`
// (see docker-compose.test.yml). A `beforeAll` triggers a rescan so the
// fixture course is in the DB before the editor is opened. Tests fail
// loudly if the fixture is missing — no skip fallback.

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function loginAdmin(request) {
  const usersRes = await request.get('/api/users');
  expect(usersRes.ok()).toBeTruthy();
  const users = await usersRes.json();
  const admin = users.find((u) => u.name === ADMIN_NAME);
  expect(admin, `expected admin "${ADMIN_NAME}" in /api/users`).toBeTruthy();
  const r = await request.post('/api/users/auth', {
    data: { userId: admin.id, password: ADMIN_PASSWORD },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.success).toBe(true);
  return admin;
}

async function attachAuthCookie(page, request) {
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);
}

// Build a tiny valid PNG once and reuse it across tests.
function tinyPngPath() {
  const tmp = path.join(os.tmpdir(), 'sg-tiny.png');
  if (!fs.existsSync(tmp)) {
    // 1x1 red PNG, smallest possible valid file.
    const b = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
      '53de00000010494441545801636060f8cf80018000000007000180fe5be3a4' +
      '0000000049454e44ae426082',
      'hex',
    );
    fs.writeFileSync(tmp, b);
  }
  return tmp;
}

async function openCourseEditor(page) {
  const editBtn = page.locator('button[title="Edit course"]').first();
  await expect(editBtn).toBeVisible({ timeout: 10_000 });
  await editBtn.click();
  await page.waitForSelector('[data-testid=thumbnail-dropzone]', { timeout: 5_000 });
}

test.describe('thumbnail dropzone', () => {
  test.beforeAll(async ({ request }) => {
    await loginAdmin(request);
    const rescan = await request.post('/api/courses/rescan', { data: { preserveMetadata: true } });
    expect(rescan.ok()).toBeTruthy();
    for (let i = 0; i < 30; i += 1) {
      const s = await request.get('/api/status/scan');
      const body = await s.json();
      if (body.complete) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Rescan did not complete in time');
  });

  test('clicking the dropzone hidden input uploads a real image', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');

    await openCourseEditor(page);

    const fileInput = page.locator('#thumbnailUpload');
    await fileInput.setInputFiles(tinyPngPath());

    // Preview img receives the blob URL.
    const preview = page.locator('img[alt="Course thumbnail"]');
    await expect(preview).toBeVisible();
  });

  test('drop a non-image shows the inline error', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');

    await openCourseEditor(page);

    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      const dt = new DataTransfer();
      dt.items.add(new File(['hello'], 'hello.txt', { type: 'text/plain' }));
      dz.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });

    await expect(page.locator('[data-testid=thumbnail-upload-error]')).toContainText(
      /Image files only/i,
    );
  });

  test('drag-over visual state appears and clears', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');

    await openCourseEditor(page);

    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      const dt = new DataTransfer();
      dt.items.add(new File(['x'], 'x.png', { type: 'image/png' }));
      dz.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await expect(page.locator('[data-testid=thumbnail-dropzone]')).toHaveClass(/border-primary/);

    await page.evaluate(() => {
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      dz.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    });
    await expect(page.locator('[data-testid=thumbnail-dropzone]')).not.toHaveClass(/border-primary/);
  });

  test('keyboard activates the file picker', async ({ page, request }) => {
    await loginAdmin(request);
    await attachAuthCookie(page, request);
    await page.goto('/courses');

    await openCourseEditor(page);

    const inputClicked = await page.evaluate(() => {
      let clicked = false;
      const input = document.getElementById('thumbnailUpload');
      const original = input.click.bind(input);
      input.click = () => { clicked = true; original(); };
      const dz = document.querySelector('[data-testid=thumbnail-dropzone]');
      dz.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return clicked;
    });
    expect(inputClicked).toBe(true);
  });
});
