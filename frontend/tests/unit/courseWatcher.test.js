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
  getDb().prepare("DELETE FROM courses WHERE id = 'metadata-course'").run();
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

  it('preserves a legacy course id when the same lossy-name folder is rescanned', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-watcher-legacy-id-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'C++'));
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

  it('preserves intentionally blank metadata during a normal rescan', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-watcher-empty-metadata-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'Metadata Course'));
    const db = getDb();
    db.prepare(`
      INSERT INTO courses (id, title, description, category, release_date, folder_name, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'metadata-course',
      'Metadata Course',
      '',
      '',
      '',
      'Metadata Course',
      JSON.stringify({
        id: 'metadata-course',
        title: 'Metadata Course',
        description: '',
        category: '',
        releaseDate: '',
        lessons: []
      })
    );

    await scanCoursesOnStartup(false, true);

    expect(db.prepare(`
      SELECT description, category, release_date FROM courses WHERE id = 'metadata-course'
    `).get()).toEqual({ description: '', category: '', release_date: '' });
  });
});
