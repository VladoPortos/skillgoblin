import { test, expect } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function getAdmin(request) {
  const users = await (await request.get('/api/users')).json();
  return users.find(user => user.name === ADMIN_NAME);
}

async function loginAdmin(request) {
  const admin = await getAdmin(request);
  await request.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  return admin;
}

async function firstCourse(request) {
  const list = await (await request.get('/api/courses?limit=20')).json();
  const item = list.items?.[0];
  expect(item).toBeTruthy();
  return (await request.get(`/api/courses/${item.id}`)).json();
}

test('keyboard-only journey selects a profile, opens a course, and selects a video', async ({ page }) => {
  await page.goto('/');
  const profile = page.getByRole('button', { name: new RegExp(ADMIN_NAME, 'i') });
  await profile.focus();
  await page.keyboard.press('Enter');
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).press('Enter');
  await page.waitForURL(/\/courses/);

  const courseLink = page.getByRole('link', { name: /^Open course /i }).first();
  await courseLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/courses\/[^/]+/);

  const lessonToggle = page.locator('[data-testid^="lesson-toggle-"]').first();
  await lessonToggle.focus();
  if (await lessonToggle.getAttribute('aria-expanded') === 'false') {
    await page.keyboard.press('Enter');
  }
  const video = page.locator('[data-testid^="lesson-video-"]').first();
  await video.focus();
  await page.keyboard.press('Enter');
  await expect(video).toBeFocused();
});

test('failed user loading is visible and retryable', async ({ page }) => {
  await page.route('**/api/users', route => route.fulfill({ status: 503, body: '{"error":"offline"}' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(/could not load users/i);
  await page.unroute('**/api/users');
  await page.getByTestId('retry-users').click();
  await expect(page.getByRole('button', { name: new RegExp(ADMIN_NAME, 'i') })).toBeVisible();
});

test('failed course loading is visible and retryable', async ({ page, request }) => {
  await loginAdmin(request);
  await page.context().addCookies((await request.storageState()).cookies);
  const course = await firstCourse(request);
  await page.route(`**/api/courses/${course.id}`, route => route.fulfill({ status: 503, body: '{"error":"offline"}' }));
  await page.goto(`/courses/${course.id}`);
  await expect(page.getByRole('alert')).toContainText(/could not load this course/i);
  await page.unroute(`**/api/courses/${course.id}`);
  await page.getByTestId('retry-course-load').click();
  await expect(page.locator('video')).toBeVisible();
});

test('course header fits a 320px viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loginAdmin(request);
  await page.context().addCookies((await request.storageState()).cookies);
  const course = await firstCourse(request);
  await page.goto(`/courses/${course.id}`);
  await page.waitForLoadState('networkidle');
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
});

test('choosing a profile action closes the dropdown instead of reopening it', async ({ page, request }) => {
  await loginAdmin(request);
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto('/courses');
  const trigger = page.getByTestId('user-profile-trigger');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /my profile/i }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: /my profile/i })).toBeVisible();
});
