import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';

let db;
let dbPath;
let savedEnv;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `sg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  db = new BetterSqlite3(dbPath);
  savedEnv = process.env.ALLOW_USER_REGISTRATION;
  delete process.env.ALLOW_USER_REGISTRATION;
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  if (savedEnv === undefined) delete process.env.ALLOW_USER_REGISTRATION;
  else process.env.ALLOW_USER_REGISTRATION = savedEnv;
});

function getSetting(key) {
  return db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key)?.value;
}

describe('003_allow_user_registration — fresh install', () => {
  it('seeds allow_user_registration=true when env unset', () => {
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });

  it('seeds allow_user_registration=false when env=false', () => {
    process.env.ALLOW_USER_REGISTRATION = 'false';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('false');
  });

  it('seeds allow_user_registration=true when env=true', () => {
    process.env.ALLOW_USER_REGISTRATION = 'true';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });

  it('falls back to true when env value is garbage', () => {
    process.env.ALLOW_USER_REGISTRATION = 'maybe';
    runMigrations(db);
    expect(getSetting('allow_user_registration')).toBe('true');
  });
});

describe('003_allow_user_registration — idempotency', () => {
  it('re-running the migration does not clobber an admin-edited value', async () => {
    runMigrations(db);
    db.prepare("UPDATE system_settings SET value = 'false' WHERE key = 'allow_user_registration'").run();
    process.env.ALLOW_USER_REGISTRATION = 'true';
    const m = (await import('../../server/migrations/003_allow_user_registration.js')).default;
    m.up(db);
    expect(getSetting('allow_user_registration')).toBe('false');
  });
});
