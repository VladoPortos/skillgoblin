import { it, expect, vi, afterEach } from 'vitest';
const mocks = vi.hoisted(() => { vi.resetModules(); return { parse: vi.fn(), thumbnail: vi.fn() }; });
vi.mock('../../server/utils/courseMultipart.js', () => ({ parseCourseMultipart: mocks.parse }));
vi.mock('../../server/utils/thumbnailUtils', () => ({ processThumbnailBuffer: mocks.thumbnail, getCourseRootPath: () => null }));
import { getDb } from '../../server/utils/db.js';
afterEach(() => getDb().prepare("DELETE FROM courses WHERE id = 'edit-race'").run());

it.each([false, true])('reads current lessons after image processing and refuses vanished rows (%s)', async deleted => {
  const handler = (await import('../../server/api/courses/edit.post.js')).default;
  const db = getDb();
  db.prepare("INSERT INTO courses (id, title, folder_name, data) VALUES ('edit-race', 'Before', 'Edit Race', ?)").run(JSON.stringify({ lessons: [{ id: 'old' }] }));
  mocks.parse.mockResolvedValue({ fields: { course: JSON.stringify({ id: 'edit-race', title: 'Edited', description: '', category: '', releaseDate: '' }) }, files: { thumbnail: { buffer: Buffer.from('upload') } } });
  let release;
  mocks.thumbnail.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const pending = handler({ context: { user: { isAdmin: true, is_active: true } }, node: { req: {} } });
  await Promise.resolve(); await Promise.resolve();
  if (deleted) db.prepare("DELETE FROM courses WHERE id = 'edit-race'").run();
  else db.prepare("UPDATE courses SET data = ? WHERE id = 'edit-race'").run(JSON.stringify({ lessons: [{ id: 'new' }] }));
  release(Buffer.from('png'));
  if (deleted) {
    await expect(pending).rejects.toMatchObject({ statusCode: 404 });
    expect(db.prepare("SELECT id FROM courses WHERE id = 'edit-race'").get()).toBeUndefined();
  } else {
    const result = await pending;
    expect(result.course.lessons).toEqual([{ id: 'new' }]);
  }
});
