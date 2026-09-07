import { postProgress } from './progress-helpers.js';
import { test, expect } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function loginAdmin(request) {
  const users = await (await request.get('/api/users')).json();
  const admin = users.find(user => user.name === ADMIN_NAME);
  expect(admin).toBeTruthy();
  const login = await request.post('/api/users/auth', {
    data: { userId: admin.id, password: ADMIN_PASSWORD }
  });
  expect(login.ok()).toBeTruthy();
  return admin;
}

async function firstCourse(request) {
  const list = await (await request.get('/api/courses?limit=20')).json();
  for (const item of list.items || []) {
    const course = await (await request.get(`/api/courses/${item.id}`)).json();
    if (course.lessons?.some(lesson => lesson.videos?.length)) return course;
  }
  throw new Error('Expected a fixture course containing at least one video');
}

function videoIds(course) {
  return course.lessons.flatMap(lesson =>
    lesson.videos.map(video => video.id)
  );
}

test.describe('progress integrity', () => {
  test('local HTTP saves silently and retains browser recovery without randomUUID', async ({ page, request }) => {
    const admin = await loginAdmin(request);
    const course = await firstCourse(request);
    await postProgress(request, `/api/user-progress/${admin.id}`, {data:{courseId:course.id,data:{favorite:false,completed:{},progress:{}}}});
    await page.context().addCookies((await request.storageState()).cookies);
    await page.addInitScript(() => Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true }));
    let release, writes = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(`**/api/user-progress/${admin.id}`, async route => {
      if (route.request().method() === 'POST') { writes++; await gate; }
      await route.continue();
    });
    try {
      await page.goto(`/courses/${course.id}`);
      await expect(page.getByTestId('progress-save-status')).toBeHidden();
      await page.getByRole('button',{name:'Add to favorites',exact:true}).click();
      await expect.poll(() => writes).toBeGreaterThan(0);
      await expect(page.getByTestId('progress-save-status')).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem('sg-progress-tab'))).toBeTruthy();
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('sg-progress:')))).toBe(true);
    } finally { release(); }
    await expect.poll(async () => (await (await request.get(`/api/user-progress/${admin.id}`)).json()).progress[course.id].favorite).toBe(true);
    await expect(page.getByTestId('progress-save-status')).toBeHidden();
  });

  test('failed saves show retry and preserve remote completion when rebasing', async ({ page, request }) => {
    const admin = await loginAdmin(request);
    const course = await firstCourse(request);
    const id = videoIds(course)[0];
    await postProgress(request, `/api/user-progress/${admin.id}`, {data:{courseId:course.id,data:{completed:{},progress:{},favorite:false}}});
    await page.context().addCookies((await request.storageState()).cookies);
    let unavailable = true;
    await page.route(`**/api/user-progress/${admin.id}`, async route => {
      if (route.request().method() === 'POST' && unavailable) return route.fulfill({status:503,contentType:'application/json',body:'{"statusMessage":"offline"}'});
      await route.continue();
    });
    await page.goto(`/courses/${course.id}`);
    await page.getByRole('button',{name:'Add to favorites',exact:true}).click();
    await expect(page.getByTestId('progress-save-status')).toContainText('could not be saved');
    await expect(page.getByTestId('progress-save-status')).not.toContainText('cannot be backed up');
    // Another device completes a video while this browser has an unsaved favorite.
    await postProgress(request, `/api/user-progress/${admin.id}`, {data:{courseId:course.id,data:{completed:{[id]:true},progress:{},favorite:false}}});
    unavailable = false;
    await page.getByRole('button',{name:'Retry now',exact:true}).click();
    await expect.poll(async () => (await (await request.get(`/api/user-progress/${admin.id}`)).json()).progress[course.id].favorite).toBe(true);
    await expect(page.getByTestId('progress-save-status')).toBeHidden();
    const state = await (await request.get(`/api/user-progress/${admin.id}`)).json();
    expect(state.progress[course.id].favorite).toBe(true);
    expect(state.progress[course.id].completed[id]).toBe(true);
  });

  test('In Progress includes partial playback and excludes fully completed courses', async ({ request }) => {
    const admin = await loginAdmin(request);
    const course = await firstCourse(request);
    const ids = videoIds(course);

    await postProgress(request, `/api/user-progress/${admin.id}`, {
      data: {
        courseId: course.id,
        data: { completed: {}, progress: { [ids[0]]: 50 }, favorite: false }
      }
    });
    const partial = await (await request.get(`/api/user-progress-courses/${admin.id}`)).json();
    expect(partial.inProgress.map(item => item.id)).toContain(course.id);
    expect(partial.inProgress.find(item => item.id === course.id).progressPercentage).toBeGreaterThan(0);

    await postProgress(request, `/api/user-progress/${admin.id}`, {
      data: {
        courseId: course.id,
        data: {
          completed: Object.fromEntries(ids.map(id => [id, true])),
          progress: Object.fromEntries(ids.map(id => [id, 100])),
          favorite: false
        }
      }
    });
    const complete = await (await request.get(`/api/user-progress-courses/${admin.id}`)).json();
    expect(complete.inProgress.map(item => item.id)).not.toContain(course.id);
  });

  test('failed progress hydration never writes an empty snapshot on navigation', async ({ page, request }) => {
    const admin = await loginAdmin(request);
    const course = await firstCourse(request);
    const targetId = videoIds(course)[0];
    const seeded = {
      completed: { [targetId]: true },
      progress: { [targetId]: 42 },
      favorite: true,
      lastViewed: { lessonId: course.lessons[0].id, videoIndex: 0 }
    };
    await postProgress(request, `/api/user-progress/${admin.id}`, {
      data: { courseId: course.id, data: seeded }
    });

    await page.context().addCookies((await request.storageState()).cookies);
    let blockedReads = 0;
    let writes = 0;
    await page.route(`**/api/user-progress/${admin.id}`, async route => {
      if (route.request().method() === 'GET') {
        blockedReads += 1;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      } else {
        writes += 1;
        await route.continue();
      }
    });

    await page.goto('/courses');
    await page.goto(`/courses/${course.id}`);
    await expect.poll(() => blockedReads).toBeGreaterThanOrEqual(2);
    await page.goBack();
    await page.waitForURL(/\/courses/);
    await page.waitForTimeout(250);
    expect(writes).toBe(0);

    const persisted = await (await request.get(`/api/user-progress/${admin.id}`)).json();
    expect(persisted.progress[course.id]).toEqual(seeded);
  });
});
