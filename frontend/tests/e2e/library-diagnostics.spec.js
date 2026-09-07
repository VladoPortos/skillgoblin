import { test, expect } from '@playwright/test';

test('administrator can inspect library configuration and a video', async ({ page }) => {
  expect((await page.request.get('/api/admin/diagnostics')).status()).toBe(401);
  const users = await (await page.request.get('/api/users')).json();
  const admin = users.find(user => user.name === (process.env.PW_ADMIN_NAME || 'root'));
  const login = await page.request.post('/api/users/auth', {data:{userId:admin.id,password:process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!'}});
  expect(login.ok()).toBeTruthy();
  const catalog = await (await page.request.get('/api/courses?limit=20')).json();
  const course = catalog.items.find(item => item.videoCount > 0);
  expect(course).toBeTruthy();
  await page.goto('/courses');
  await page.locator('.user-profile').click();
  await page.getByRole('button',{name:/admin panel/i}).click();
  await page.getByTestId('admin-tab-diagnostics').click();
  await expect(page.getByRole('heading',{name:'Library diagnostics'})).toBeVisible();
  await expect(page.getByText('contentDirectory',{exact:true})).toBeVisible();
  await page.getByLabel('Course ID',{exact:true}).fill(course.id);
  await page.getByRole('button',{name:'Inspect video',exact:true}).click();
  await expect(page.getByText(/Checked \d+ of \d+ files\. Missing:/)).toBeVisible();
  // The fixture may be an empty placeholder: diagnosis must explain that too.
  await expect(page.getByText(/Container:|damaged|unreadable|ffprobe/i).last()).toBeVisible();
});
