import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';
import { bootstrapAdmin, reportLegacyCredentialGaps } from '../../server/utils/bootstrap.js';
import { hashCredential, verifyCredential, looksHashed } from '../../server/utils/credentials.js';

let db;
let dbPath;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `sg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  db = new BetterSqlite3(dbPath);
  runMigrations(db);
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('bootstrapAdmin', () => {
  it('creates an admin when the DB has none and env supplies credentials', async () => {
    const r = await bootstrapAdmin(db, { ADMIN_NAME: 'root', ADMIN_PASSWORD: 'hunter2' });
    expect(r.created).toBe(true);
    expect(r.name).toBe('root');

    const row = db.prepare('SELECT name, isAdmin, is_active, password FROM users WHERE id = ?').get(r.id);
    expect(row.name).toBe('root');
    expect(row.isAdmin).toBe(1);
    expect(row.is_active).toBe(1);
    expect(looksHashed(row.password)).toBe(true);
  });

  it('hashes the admin password (not stored as plaintext)', async () => {
    await bootstrapAdmin(db, { ADMIN_NAME: 'root', ADMIN_PASSWORD: 'hunter2' });
    const row = db.prepare('SELECT password FROM users WHERE name = ?').get('root');
    expect(row.password).not.toBe('hunter2');
    const v = await verifyCredential('hunter2', row.password);
    expect(v.ok).toBe(true);
  });

  it('is a no-op when an admin already exists', async () => {
    await bootstrapAdmin(db, { ADMIN_NAME: 'root', ADMIN_PASSWORD: 'hunter2' });
    const r2 = await bootstrapAdmin(db, { ADMIN_NAME: 'evil', ADMIN_PASSWORD: 'pwn' });
    expect(r2.created).toBe(false);
    expect(r2.reason).toBe('admin_exists');

    // Ensure the second call did not add a second admin row.
    const adminCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE isAdmin = 1').get().c;
    expect(adminCount).toBe(1);
  });

  it('throws if no admin exists and env is missing either var', async () => {
    await expect(bootstrapAdmin(db, {})).rejects.toThrow(/ADMIN_NAME \/ ADMIN_PASSWORD/);
    await expect(bootstrapAdmin(db, { ADMIN_NAME: 'root' })).rejects.toThrow(/ADMIN_NAME \/ ADMIN_PASSWORD/);
    await expect(bootstrapAdmin(db, { ADMIN_PASSWORD: 'hunter2' })).rejects.toThrow(/ADMIN_NAME \/ ADMIN_PASSWORD/);
    // Empty / whitespace-only values count as missing.
    await expect(bootstrapAdmin(db, { ADMIN_NAME: '   ', ADMIN_PASSWORD: 'x' })).rejects.toThrow();
    await expect(bootstrapAdmin(db, { ADMIN_NAME: 'root', ADMIN_PASSWORD: '' })).rejects.toThrow();
  });

  it('refuses to bootstrap if ADMIN_NAME collides with an existing non-admin user', async () => {
    db.prepare(
      `INSERT INTO users (id, name, password, isAdmin, is_active) VALUES (?, ?, ?, 0, 1)`
    ).run('u1', 'root', await hashCredential('whatever'));

    await expect(
      bootstrapAdmin(db, { ADMIN_NAME: 'root', ADMIN_PASSWORD: 'hunter2' })
    ).rejects.toThrow(/collides with an existing/);
  });
});

describe('reportLegacyCredentialGaps', () => {
  it('returns an empty list and emits no warning when every user has at least one credential', () => {
    db.prepare(
      `INSERT INTO users (id, name, password, isAdmin, is_active) VALUES (?, ?, ?, 0, 1)`
    ).run('u1', 'Alice', '$argon2id$placeholder');

    const lines = [];
    const result = reportLegacyCredentialGaps(db, (l) => lines.push(l));
    expect(result).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('lists users that have no password and no PIN, and emits a warning per user', () => {
    db.prepare(
      `INSERT INTO users (id, name, password, pin, isAdmin, is_active) VALUES (?, ?, NULL, NULL, 0, 1)`
    ).run('u1', 'Alice');
    db.prepare(
      `INSERT INTO users (id, name, password, pin, isAdmin, is_active) VALUES (?, ?, NULL, NULL, 0, 1)`
    ).run('u2', 'Bob');
    db.prepare(
      `INSERT INTO users (id, name, password, pin, isAdmin, is_active) VALUES (?, ?, ?, NULL, 0, 1)`
    ).run('u3', 'Carol', '$argon2id$placeholder');

    const lines = [];
    const result = reportLegacyCredentialGaps(db, (l) => lines.push(l));

    const names = result.map(r => r.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
    // Header + 2 user lines:
    expect(lines.length).toBe(3);
    expect(lines[0]).toMatch(/2 legacy user/);
  });
});
