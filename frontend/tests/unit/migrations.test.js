import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';

let db;
let dbPath;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `sg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  db = new BetterSqlite3(dbPath);
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

function tableNames() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map(r => r.name);
}

describe('migration runner', () => {
  it('creates the migrations bookkeeping table on a fresh db', () => {
    runMigrations(db);
    expect(tableNames()).toContain('migrations');
  });

  it('records every migration name after applying', () => {
    runMigrations(db);
    const applied = db.prepare('SELECT name FROM migrations').all().map(r => r.name);
    expect(applied).toContain('001_initial');
  });

  it('is idempotent — running twice does not double-apply or throw', () => {
    runMigrations(db);
    const firstCount = db.prepare('SELECT COUNT(*) AS c FROM migrations').get().c;
    runMigrations(db);
    const secondCount = db.prepare('SELECT COUNT(*) AS c FROM migrations').get().c;
    expect(secondCount).toBe(firstCount);
  });

  it('rolls back via the runner when a migration body throws', () => {
    // Inject a custom manifest with one migration that creates a table and
    // then fails. The runner must catch the error, ROLLBACK, and re-throw.
    // Critically, the partially-created table must not survive the rollback,
    // and the migration name must not be recorded.
    const manifest = [
      {
        name: 'bad_migration',
        up(d) {
          d.exec('CREATE TABLE x_should_not_persist (a INTEGER)');
          d.exec('SELECT * FROM definitely_does_not_exist');
        }
      }
    ];

    let caught;
    try {
      runMigrations(db, manifest);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(tableNames()).not.toContain('x_should_not_persist');
    expect(tableNames()).toContain('migrations'); // bookkeeping table is created before the loop
    const recorded = db.prepare('SELECT name FROM migrations WHERE name = ?').get('bad_migration');
    expect(recorded).toBeUndefined();
  });

  it('after a failure, a subsequent good run can apply the same migration name', () => {
    let firstError;
    try {
      runMigrations(db, [{ name: 'm1', up(d) { d.exec('SELECT bad_call_that_throws()'); } }]);
    } catch (e) {
      firstError = e;
    }
    expect(firstError).toBeInstanceOf(Error);

    // Same name, different body that succeeds.
    runMigrations(db, [{ name: 'm1', up(d) { d.exec('CREATE TABLE good (a INTEGER)'); } }]);
    expect(tableNames()).toContain('good');
    const recorded = db.prepare('SELECT name FROM migrations WHERE name = ?').get('m1');
    expect(recorded?.name).toBe('m1');
  });

  it('rejects malformed manifest entries without partial application', () => {
    expect(() => runMigrations(db, [{ name: 'no_up_function' }])).toThrow(/Invalid migration entry/);
    expect(() => runMigrations(db, [{ up() {} }])).toThrow(/Invalid migration entry/);
  });
});

describe('001_initial', () => {
  it('creates all four legacy tables on a fresh db', () => {
    runMigrations(db);
    const names = tableNames();
    expect(names).toContain('users');
    expect(names).toContain('user_progress');
    expect(names).toContain('courses');
    expect(names).toContain('settings');
  });

  it('produces a courses table that includes thumbnail_data', () => {
    runMigrations(db);
    const cols = db.prepare("SELECT name FROM pragma_table_info('courses')").all().map(r => r.name);
    expect(cols).toContain('thumbnail_data');
  });

  it('is no-op-equivalent against a pre-existing main-schema db (upgrade scenario)', () => {
    // Simulate a pre-PR install: tables already exist, with the inline thumbnail_data migration
    // having already run.
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT, theme TEXT DEFAULT 'dark', password TEXT, pin TEXT, use_auth INTEGER DEFAULT 0, isAdmin INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE user_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, progress TEXT DEFAULT '{}', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id));
      CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, folder_name TEXT NOT NULL, thumbnail TEXT, thumbnail_data BLOB, category TEXT DEFAULT 'Uncategorized', release_date TEXT, data TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE, UNIQUE(user_id, key));
      INSERT INTO users (id, name) VALUES ('u1', 'Alice');
    `);

    runMigrations(db);

    const user = db.prepare('SELECT id, name FROM users WHERE id=?').get('u1');
    expect(user).toEqual({ id: 'u1', name: 'Alice' });

    const cols = db.prepare("SELECT name FROM pragma_table_info('courses')").all().map(r => r.name);
    expect(cols).toContain('thumbnail_data');

    const applied = db.prepare('SELECT name FROM migrations').all().map(r => r.name);
    expect(applied).toContain('001_initial');
  });

  it('adds thumbnail_data on an old install where the inline ALTER never ran', () => {
    // Pre-PR install whose courses table predates thumbnail_data.
    db.exec(`
      CREATE TABLE courses (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, folder_name TEXT NOT NULL, thumbnail TEXT, category TEXT DEFAULT 'Uncategorized', release_date TEXT, data TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);

    runMigrations(db);

    const cols = db.prepare("SELECT name FROM pragma_table_info('courses')").all().map(r => r.name);
    expect(cols).toContain('thumbnail_data');
  });
});
