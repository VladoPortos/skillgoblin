import { describe, it, expect, afterEach, vi } from 'vitest';
import * as generator from '../../server/utils/courseGenerator.js';
import * as thumbnails from '../../server/utils/thumbnailUtils.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { topLevelCoursePath, scanCoursesOnStartup, initialScanStatus, closeCourseWatchers, setupFileWatcher, synchronizeCourseThumbnail } from '../../server/utils/courseWatcher.js';
import { getDb } from '../../server/utils/db.js';

let tempDir;
afterEach(() => {
  vi.restoreAllMocks();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.CONTENT_DIR;
  getDb().prepare("DELETE FROM courses WHERE id = 'c'").run();
  getDb().prepare("DELETE FROM courses WHERE id = 'metadata-course'").run();
});

describe('course watcher routing', () => {
  it('does not overwrite a UI thumbnail uploaded while a cover image is processing', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-thumb-cas-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'Metadata Course'));
    fs.writeFileSync(path.join(tempDir, 'Metadata Course', 'cover.png'), 'local cover');
    const db = getDb();
    db.prepare("INSERT INTO courses (id, title, folder_name, data, thumbnail_data) VALUES ('metadata-course', 'Test', 'Metadata Course', '{}', ?)").run(Buffer.from('original'));
    let release;
    vi.spyOn(thumbnails, 'readAndProcessThumbnail').mockReturnValue(new Promise(resolve => { release = resolve; }));
    const pending = synchronizeCourseThumbnail('metadata-course', 'Metadata Course');
    db.prepare("UPDATE courses SET thumbnail_data = ? WHERE id = 'metadata-course'").run(Buffer.from('new UI upload'));
    release(Buffer.from('processed old local cover'));
    await pending;
    expect(db.prepare("SELECT thumbnail_data FROM courses WHERE id = 'metadata-course'").get().thumbnail_data.toString()).toBe('new UI upload');
  });
  it('stops a full scan after its current course on shutdown', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-scan-stop-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'Metadata Course'));
    fs.mkdirSync(path.join(tempDir, 'Z Course'));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const scan = vi.spyOn(generator, 'generateCourseJson').mockImplementation(async () => {
      await gate;
      return { id: 'metadata-course', title: 'Test', lessons: [], description: '', category: '', releaseDate: '', thumbnail: '' };
    });
    const pending = scanCoursesOnStartup(true, true);
    await Promise.resolve();
    const closing = closeCourseWatchers();
    release();
    await closing;
    expect(await pending).toBe(false);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(initialScanStatus.inProgress).toBe(false);
    expect(initialScanStatus.complete).toBe(false);
    // Restore watcher lifecycle for other tests in the shared module pool.
    await setupFileWatcher().close();
  });
  it('coalesces forced scans and preserves metadata edited during generation', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-scan-race-'));
    process.env.CONTENT_DIR = tempDir;
    fs.mkdirSync(path.join(tempDir, 'Metadata Course'));
    const db = getDb();
    db.prepare("INSERT INTO courses (id, title, folder_name, data) VALUES ('metadata-course', 'Before', 'Metadata Course', '{}')").run();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const scan = vi.spyOn(generator, 'generateCourseJson').mockImplementation(async () => {
      await gate;
      return { id: 'metadata-course', title: 'Generated', lessons: [], description: '', category: '', releaseDate: '', thumbnail: '' };
    });
    const first = scanCoursesOnStartup(true, true);
    expect(initialScanStatus.inProgress).toBe(true);
    expect(initialScanStatus.complete).toBe(false);
    const second = scanCoursesOnStartup(true, true);
    expect(second).toBe(first);
    await Promise.resolve();
    db.prepare("UPDATE courses SET title = 'Edited during scan' WHERE id = 'metadata-course'").run();
    release();
    await first;
    expect(scan).toHaveBeenCalledTimes(1);
    expect(db.prepare("SELECT title FROM courses WHERE id = 'metadata-course'").get().title).toBe('Edited during scan');
  });
  it('maps nested changes to the owning top-level course', () => {
    const root = path.resolve('content');
    const nested = path.join(root, 'Course A', 'Lesson 1', 'video.mp4');
    expect(topLevelCoursePath(root, nested)).toBe(path.join(root, 'Course A'));
  });

  it('ignores changes outside the content root', () => {
    const root = path.resolve('content');
    expect(topLevelCoursePath(root, path.resolve('elsewhere', 'video.mp4'))).toBeNull();
  });

  it('retains missing courses as unavailable during an empty mount scan', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-watcher-'));
    process.env.CONTENT_DIR = tempDir;
    const db = getDb();
    const id = `stale-${Date.now()}`;
    db.prepare(`
      INSERT INTO courses (id, title, folder_name, data)
      VALUES (?, ?, ?, ?)
    `).run(id, 'Stale', 'Missing Course', JSON.stringify({ id, title: 'Stale' }));

    await scanCoursesOnStartup(false, true);

    expect(db.prepare('SELECT id, available FROM courses WHERE id = ?').get(id)).toEqual({ id, available: 0 });
    db.prepare('DELETE FROM courses WHERE id = ?').run(id);
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
