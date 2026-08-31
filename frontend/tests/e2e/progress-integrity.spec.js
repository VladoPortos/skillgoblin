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
    lesson.videos.map((video, index) => `${lesson.id}-${index}`)
  );
}

test.describe('progress integrity', () => {
  test('In Progress includes partial playback and excludes fully completed courses', async ({ request }) => {
    const admin = await loginAdmin(request);
    const course = await firstCourse(request);
    const ids = videoIds(course);

    await request.post(`/api/user-progress/${admin.id}`, {
      data: {
        courseId: course.id,
        data: { completed: {}, progress: { [ids[0]]: 50 }, favorite: false }
      }
    });
    const partial = await (await request.get(`/api/user-progress-courses/${admin.id}`)).json();
    expect(partial.inProgress.map(item => item.id)).toContain(course.id);
    expect(partial.inProgress.find(item => item.id === course.id).progressPercentage).toBeGreaterThan(0);

    await request.post(`/api/user-progress/${admin.id}`, {
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
    await request.post(`/api/user-progress/${admin.id}`, {
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
