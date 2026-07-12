import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { saveCourseToDb } from '../../server/utils/courseDatabase.js';

let db;
afterEach(() => db?.close());

function makeDb() {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
      folder_name TEXT NOT NULL, thumbnail TEXT, thumbnail_data BLOB,
      category TEXT, release_date TEXT, data TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return db;
}

function course(id, title) {
  return { id, title, description: '', thumbnail: 'thumbnail.png', category: 'Test', releaseDate: '', lessons: [] };
}

describe('saveCourseToDb course identity', () => {
  it('does not overwrite a different folder that generated the same id', () => {
    const testDb = makeDb();
    expect(saveCourseToDb(course('c', 'C++'), 'C++', testDb)).toEqual({ success: true });
    const result = saveCourseToDb(course('c', 'C#'), 'C#', testDb);
    expect(result.error).toMatch(/collision/i);
    expect(testDb.prepare('SELECT title, folder_name FROM courses WHERE id = ?').get('c'))
      .toEqual({ title: 'C++', folder_name: 'C++' });
  });
});
