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

function userColumns() {
  return db.prepare("SELECT name FROM pragma_table_info('users')").all().map(r => r.name);
}
function tableNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
}

describe('002_auth_hardening — fresh install', () => {
  beforeEach(() => runMigrations(db));

  it('users table has is_active and no use_auth', () => {
    const cols = userColumns();
    expect(cols).toContain('is_active');
    expect(cols).not.toContain('use_auth');
  });

  it('user_sessions table exists with the expected columns and indexes', () => {
    expect(tableNames()).toContain('user_sessions');
    const cols = db.prepare("SELECT name FROM pragma_table_info('user_sessions')").all().map(r => r.name);
    expect(cols.sort()).toEqual([
      'created_at', 'expires_at', 'last_seen_at', 'token_hash', 'user_agent', 'user_id'
    ].sort());

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='user_sessions'")
      .all().map(r => r.name);
    expect(indexes).toContain('idx_user_sessions_user_id');
    expect(indexes).toContain('idx_user_sessions_expires_at');
  });

  it('system_settings exists and is seeded with the two known keys', () => {
    expect(tableNames()).toContain('system_settings');
    const rows = db.prepare("SELECT key, value FROM system_settings ORDER BY key").all();
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    expect(map.allow_pin).toBe('true');
    expect(map.auto_approve_new_users).toBe('false');
  });
});

describe('002_auth_hardening — upgrade from a pre-PR DB', () => {
  beforeEach(() => {
    // Stand up the legacy schema directly, bypassing the migration runner.
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT,
        theme TEXT DEFAULT 'dark', password TEXT, pin TEXT,
        use_auth INTEGER DEFAULT 0, isAdmin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users (id, name, password, use_auth, isAdmin) VALUES ('u1', 'Alice', 'plaintext', 1, 0);
      INSERT INTO users (id, name, pin, use_auth, isAdmin) VALUES ('u2', 'Bob', '1234', 1, 0);
      INSERT INTO users (id, name, use_auth, isAdmin) VALUES ('u3', 'Carol', 0, 0);
    `);
  });

  it('preserves existing user rows, drops use_auth, sets is_active = 1 by default', () => {
    runMigrations(db);

    const cols = userColumns();
    expect(cols).not.toContain('use_auth');
    expect(cols).toContain('is_active');

    const alice = db.prepare('SELECT name, password, is_active, isAdmin FROM users WHERE id = ?').get('u1');
    expect(alice.name).toBe('Alice');
    expect(alice.password).toBe('plaintext'); // intentionally still plaintext until first login
    expect(alice.is_active).toBe(1);
    expect(alice.isAdmin).toBe(0);

    const carol = db.prepare('SELECT password, pin, is_active FROM users WHERE id = ?').get('u3');
    expect(carol.password).toBeNull();
    expect(carol.pin).toBeNull();
    // Existing legacy users are not locked out by the upgrade itself; the
    // bootstrap warning will flag them so an admin can set credentials.
    expect(carol.is_active).toBe(1);
  });

  it('is idempotent: re-running on an already-migrated DB does not lose data or duplicate seed', () => {
    runMigrations(db);
    const beforeCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const beforeSettings = db
      .prepare('SELECT COUNT(*) AS c FROM system_settings WHERE key IN (?, ?)')
      .get('allow_pin', 'auto_approve_new_users').c;

    runMigrations(db);

    const afterCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const afterSettings = db
      .prepare('SELECT COUNT(*) AS c FROM system_settings WHERE key IN (?, ?)')
      .get('allow_pin', 'auto_approve_new_users').c;

    expect(afterCount).toBe(beforeCount);
    expect(afterSettings).toBe(beforeSettings);
    expect(afterSettings).toBe(2);
  });

  it('does NOT clobber an admin-edited setting value when re-applied', () => {
    runMigrations(db);
    db.prepare("UPDATE system_settings SET value = 'true' WHERE key = 'auto_approve_new_users'").run();
    runMigrations(db);
    const v = db.prepare("SELECT value FROM system_settings WHERE key = 'auto_approve_new_users'").get().value;
    expect(v).toBe('true');
  });
});
