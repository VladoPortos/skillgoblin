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
  // Titles and creation order are intentionally out of phase so a
  // regression where "newest" silently falls back to "title" would fail.
  // Apple < Zebra alphabetically; Zebra is younger.
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('apple', 'Apple', JSON.stringify({ id: 'apple', title: 'Apple' }), '2020-01-01 00:00:00');
  db.prepare(
    `INSERT INTO courses (id, title, data, created_at) VALUES (?, ?, ?, ?)`,
  ).run('zebra', 'Zebra', JSON.stringify({ id: 'zebra', title: 'Zebra' }), '2026-05-03 00:00:00');
});
afterEach(() => {
  if (db) db.close();
});

describe('getAllCoursesWithMeta', () => {
  it('returns rows with created_at attached to the parsed data', () => {
    const rows = getAllCoursesWithMeta(db);
    const map = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(map['apple'].created_at).toBe('2020-01-01 00:00:00');
    expect(map['zebra'].created_at).toBe('2026-05-03 00:00:00');
    expect(map['zebra'].title).toBe('Zebra');
  });

  it('orders by title ASC by default', () => {
    const rows = getAllCoursesWithMeta(db);
    expect(rows.map((r) => r.id)).toEqual(['apple', 'zebra']);
  });

  it('orders by created_at DESC when sort is "newest"', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'newest' });
    expect(rows.map((r) => r.id)).toEqual(['zebra', 'apple']);
  });

  it('falls back to title for unknown sort values', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'garbage' });
    expect(rows.map((r) => r.id)).toEqual(['apple', 'zebra']);
  });

  it('does NOT mistake any non-newest sort for newest (regression guard)', () => {
    const rows = getAllCoursesWithMeta(db, { sort: 'NEWEST' }); // case-sensitive
    expect(rows.map((r) => r.id)).toEqual(['apple', 'zebra']);
  });
});
