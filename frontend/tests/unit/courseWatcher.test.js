import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { topLevelCoursePath, scanCoursesOnStartup } from '../../server/utils/courseWatcher.js';
import { getDb } from '../../server/utils/db.js';

let tempDir;
afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.CONTENT_DIR;
  getDb().prepare("DELETE FROM courses WHERE id = 'c'").run();
});

describe('course watcher routing', () => {
  it('maps nested changes to the owning top-level course', () => {
    const root = path.resolve('content');
    const nested = path.join(root, 'Course A', 'Lesson 1', 'video.mp4');
    expect(topLevelCoursePath(root, nested)).toBe(path.join(root, 'Course A'));
  });

  it('ignores changes outside the content root', () => {
    const root = path.resolve('content');
    expect(topLevelCoursePath(root, path.resolve('elsewhere', 'video.mp4'))).toBeNull();
  });

  it('removes stale database courses during a non-forced startup scan', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-watcher-'));
    process.env.CONTENT_DIR = tempDir;
    const db = getDb();
    const id = `stale-${Date.now()}`;
    db.prepare(`
      INSERT INTO courses (id, title, folder_name, data)
      VALUES (?, ?, ?, ?)
    `).run(id, 'Stale', 'Missing Course', JSON.stringify({ id, title: 'Stale' }));

    await scanCoursesOnStartup(false, true);

    expect(db.prepare('SELECT id FROM courses WHERE id = ?').get(id)).toBeUndefined();
  });

  it('preserves a stale row and progress when an on-disk folder collides with its id', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-watcher-collision-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'C#'));
    const db = getDb();
    db.prepare("DELETE FROM courses WHERE id = 'c'").run();
    db.prepare(`
      INSERT INTO courses (id, title, folder_name, data)
      VALUES ('c', 'Original', 'C++', ?)
    `).run(JSON.stringify({ id: 'c', title: 'Original' }));

    await scanCoursesOnStartup(false, true);

    expect(db.prepare("SELECT title, folder_name FROM courses WHERE id = 'c'").get())
      .toEqual({ title: 'Original', folder_name: 'C++' });
  });
});
