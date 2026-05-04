import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { getAllCoursesWithMeta } from '../../server/utils/courseDatabase.js';

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail TEXT,
      thumbnail_data BLOB,
      folder_name TEXT,
      category TEXT DEFAULT 'Uncategorized',
      release_date TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('old-1', 'Old', JSON.stringify({ id: 'old-1', title: 'Old' }), '2020-01-01 00:00:00');
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('new-1', 'New', JSON.stringify({ id: 'new-1', title: 'New' }), '2026-05-03 00:00:00');
});
afterEach(() => {
  if (db) db.close();
});

describe('getAllCoursesWithMeta', () => {
  it('returns rows with created_at attached to the parsed data', () => {
    const rows = getAllCoursesWithMeta(db);
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map['old-1'].created_at).toBe('2020-01-01 00:00:00');
    expect(map['new-1'].created_at).toBe('2026-05-03 00:00:00');
    expect(map['new-1'].title).toBe('New');
  });

  it('orders by title ASC by default', () => {
    const rows = getAllCoursesWithMeta(db);
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });

  it('orders by created_at DESC when sort is "newest"', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'newest' });
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });

  it('falls back to title for unknown sort values', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'garbage' });
    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });
});
