import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';
import { ensureNotLastAdmin } from '../../server/utils/lastAdminGuard.js';

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

function seedUser(id, isAdmin) {
  db.prepare(
    `INSERT INTO users (id, name, password, isAdmin, is_active) VALUES (?, ?, '$argon2id$x', ?, 1)`
  ).run(id, `User-${id}`, isAdmin ? 1 : 0);
}

describe('ensureNotLastAdmin', () => {
  it('does nothing when target is not an admin', () => {
    seedUser('a1', true);
    seedUser('u1', false);
    expect(() => ensureNotLastAdmin(db, 'u1', 'demote')).not.toThrow();
  });

  it('does nothing when there are 2+ admins', () => {
    seedUser('a1', true);
    seedUser('a2', true);
    expect(() => ensureNotLastAdmin(db, 'a1', 'demote')).not.toThrow();
    expect(() => ensureNotLastAdmin(db, 'a1', 'delete')).not.toThrow();
  });

  it('throws 409 when demoting the only admin', () => {
    seedUser('a1', true);
    expect(() => ensureNotLastAdmin(db, 'a1', 'demote')).toThrow();
    try {
      ensureNotLastAdmin(db, 'a1', 'demote');
    } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.statusMessage).toMatch(/last admin/);
    }
  });

  it('throws 409 when deleting the only admin', () => {
    seedUser('a1', true);
    try {
      ensureNotLastAdmin(db, 'a1', 'delete');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.statusMessage).toMatch(/delete the last admin/);
    }
  });

  it('does nothing for a non-existent target', () => {
    seedUser('a1', true);
    expect(() => ensureNotLastAdmin(db, 'ghost-id', 'demote')).not.toThrow();
  });

  it('throws 409 when deactivating the only active admin', () => {
    seedUser('a1', true);
    try {
      ensureNotLastAdmin(db, 'a1', 'deactivate');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(409);
      expect(e.statusMessage).toMatch(/deactivate the last admin/);
    }
  });

  it('counts only ACTIVE admins (a deactivated admin does not save you from demoting the last active one)', () => {
    seedUser('a1', true);
    // Manually deactivate a second "admin" to simulate a stale row.
    db.prepare(`INSERT INTO users (id, name, password, isAdmin, is_active) VALUES ('a2', 'OldAdmin', '$argon2id$x', 1, 0)`).run();
    expect(() => ensureNotLastAdmin(db, 'a1', 'demote')).toThrow();
  });
});
