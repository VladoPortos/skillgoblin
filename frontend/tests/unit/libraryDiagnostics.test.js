import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import initial from '../../server/migrations/001_initial.js';
import availability from '../../server/migrations/007_library_availability.js';
import { saveCourseToDb } from '../../server/utils/courseDatabase.js';
import { queryCourseCatalog } from '../../server/utils/courseCatalog.js';
import { recordScanError, getScanErrors } from '../../server/utils/scanDiagnostics.js';
import diagnostics from '../../server/api/admin/diagnostics.get.js';
import { mediaWarnings, diagnoseCourse } from '../../server/utils/mediaDiagnostics.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('library catalog and diagnostics', () => {
  it('paginates metadata without parsing course trees and restores availability', () => {
    const db = new Database(':memory:');
    try {
      initial.up(db); availability.up(db);
      for (const [id, category] of [['a', 'Art'], ['b', 'Code'], ['c', 'Code']]) {
        expect(saveCourseToDb({ id, title: id, category, description: '', thumbnail: '', releaseDate: '', lessons: [{ id: 'lesson', videos: [{ id: `stable-${id}`, file: 'v.mp4' }] }] }, id, db).success).toBe(true);
      }
      db.prepare("UPDATE courses SET available = 0 WHERE id = 'c'").run();
      db.prepare("UPDATE courses SET data = 'invalid json' WHERE id = 'b'").run();
      const result = queryCourseCatalog(db, { category: 'Code', limit: 1 });
      expect(result.totalItems).toBe(1);
      expect(result.items[0]).toMatchObject({ id: 'b', videoCount: 1, videoIds: ['stable-b'] });
      expect(result.items[0].lessons).toBeUndefined();
      expect(result.categoryCounts).toEqual({ all: 2, Art: 1, Code: 1 });
      expect(queryCourseCatalog(db, { search: '%' }).totalItems).toBe(0);
      db.prepare("UPDATE courses SET title = 'ŽLTÝ kurz', data = ? WHERE id = 'a'").run(JSON.stringify({ lastUpdate: 123456789 }));
      const unicode = queryCourseCatalog(db, { search: 'žltý' });
      expect(unicode.items[0]).toMatchObject({ id: 'a', lastUpdate: 123456789 });
      saveCourseToDb({ id: 'c', title: 'Returned', category: 'Code', description: '', thumbnail: '', releaseDate: '', lessons: [] }, 'c', db);
      expect(db.prepare("SELECT available FROM courses WHERE id = 'c'").get().available).toBe(1);
    } finally { db.close(); }
  });
  it('bounds diagnostic history and messages', () => {
    for (let i = 0; i < 110; i++) recordScanError(`course-${i}`, 'x'.repeat(2000));
    expect(getScanErrors()).toHaveLength(100);
    expect(getScanErrors()[0].course).toBe('course-10');
    expect(getScanErrors()[0].message).toHaveLength(1000);
  });
  it('explains codec concerns while accepting silent H.264 MP4 video', () => {
    expect(mediaWarnings({ streams: [{ codec_type: 'video', codec_name: 'h264' }], format: { format_name: 'mov,mp4' } })).toEqual([]);
    expect(mediaWarnings({ streams: [{ codec_type: 'video', codec_name: 'hevc' }, { codec_type: 'audio', codec_name: 'ac3' }], format: { format_name: 'avi' } }).join(' ')).toMatch(/device decoder.*AAC.*Container avi/s);
    expect(mediaWarnings({ streams: [{ codec_type: 'video', codec_name: 'av1' }], format: { format_name: 'webm' } })[0]).toMatch(/AV1 playback depends/);
  });
  it.each(['ENOENT', 'EACCES'])('returns a file diagnostic when stat fails with %s after path resolution', async code => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-media-race-'));
    fs.mkdirSync(path.join(root, 'Course'));
    const file = path.join(root, 'Course', 'video.mp4');
    fs.writeFileSync(file, 'test');
    const previous = process.env.CONTENT_DIR; process.env.CONTENT_DIR = root;
    const stat = fs.statSync;
    const spy = vi.spyOn(fs, 'statSync').mockImplementation((candidate, ...args) => {
      if (candidate === file) throw Object.assign(new Error('File changed'), { code });
      return stat(candidate, ...args);
    });
    try {
      const result = await diagnoseCourse({ id: 'course', folder_name: 'Course', data: JSON.stringify({ lessons: [{ videos: [{ file: 'video.mp4' }] }] }) });
      expect(result.error).toMatch(/missing or unreadable/);
      if (code === 'ENOENT') expect(result.missing).toEqual(['video.mp4']);
      else expect(result.fileErrors[0].message).toMatch(/Permission denied/);
    } finally {
      spy.mockRestore();
      if (previous === undefined) delete process.env.CONTENT_DIR; else process.env.CONTENT_DIR = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  it('requires an active admin before exposing configuration or probing', async () => {
    await expect(diagnostics({ context: {} })).rejects.toMatchObject({ statusCode: 401 });
    await expect(diagnostics({ context: { user: { is_active: 1, isAdmin: false } } })).rejects.toMatchObject({ statusCode: 403 });
  });
});
