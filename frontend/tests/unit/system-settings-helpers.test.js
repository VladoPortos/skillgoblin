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
  db.pragma('foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

// These tests exercise the SQL contract the system-settings endpoint relies
// on. The HTTP-level shape is covered by the e2e suite (upgrade-flows.spec.js).
describe('system_settings table contract', () => {
  it('seeds allow_pin=true and auto_approve_new_users=false on a fresh install', () => {
    const rows = db.prepare("SELECT key, value FROM system_settings WHERE key IN ('allow_pin', 'auto_approve_new_users')").all();
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    expect(map.allow_pin).toBe('true');
    expect(map.auto_approve_new_users).toBe('false');
  });

  it('UPSERT pattern updates an existing row and bumps updated_at', async () => {
    const before = db.prepare(`SELECT updated_at FROM system_settings WHERE key = 'allow_pin'`).get();

    // Need a tiny pause so the timestamp changes — SQLite resolution is 1s.
    await new Promise(r => setTimeout(r, 1100));

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run('allow_pin', 'false');

    const after = db.prepare(`SELECT value, updated_at FROM system_settings WHERE key = 'allow_pin'`).get();
    expect(after.value).toBe('false');
    expect(after.updated_at).not.toBe(before.updated_at);
  });

  it('UPSERT creates a row when the key did not exist', () => {
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run('brand_new_key', 'whatever');

    const row = db.prepare(`SELECT value FROM system_settings WHERE key = 'brand_new_key'`).get();
    expect(row.value).toBe('whatever');
  });
});
