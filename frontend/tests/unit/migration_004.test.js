import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import migration from '../../server/migrations/004_unique_user_names.js';

function usersDb() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  return db;
}

describe('004_unique_user_names', () => {
  it('enforces case-insensitive uniqueness', () => {
    const db = usersDb();
    migration.up(db);
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('1', 'Alice');
    expect(() => db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('2', 'alice'))
      .toThrow(/UNIQUE constraint failed/);
    db.close();
  });

  it('refuses existing duplicates without deleting either row', () => {
    const db = usersDb();
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('1', 'Alice');
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('2', 'alice');
    expect(() => migration.up(db)).toThrow(/duplicate user names.*Alice/i);
    expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(2);
    db.close();
  });
});
