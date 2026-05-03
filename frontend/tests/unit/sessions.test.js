import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { runMigrations } from '../../server/utils/migrations.js';
import {
  createSession,
  findSessionUser,
  touchSession,
  deleteSessionByToken,
  deleteUserSessions,
  pruneExpiredSessions,
  hashSessionToken,
  generateSessionToken,
  SESSION_TOUCH_DEBOUNCE_MS
} from '../../server/utils/sessions.js';

let db;
let dbPath;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `sg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  // Seed a user (sessions FK to users)
  db.prepare(
    `INSERT INTO users (id, name, password, isAdmin, is_active) VALUES ('u1', 'Alice', '$argon2id$x', 0, 1)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, name, password, isAdmin, is_active) VALUES ('u2', 'Bob',   '$argon2id$x', 1, 1)`
  ).run();
});

afterEach(() => {
  db?.close();
  if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('generateSessionToken / hashSessionToken', () => {
  it('produces high-entropy base64url tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashSessionToken is deterministic and produces 64-char hex', () => {
    const t = generateSessionToken();
    const h1 = hashSessionToken(t);
    const h2 = hashSessionToken(t);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('createSession + findSessionUser', () => {
  it('round-trips: created session is findable by its plaintext token', () => {
    const { token, expiresAt } = createSession(db, 'u1', { userAgent: 'Test/1.0' });
    expect(typeof token).toBe('string');
    expect(expiresAt).toBeGreaterThan(Date.now());

    const found = findSessionUser(db, token);
    expect(found).not.toBeNull();
    expect(found.user.id).toBe('u1');
    expect(found.user.name).toBe('Alice');
    expect(found.user.isAdmin).toBe(0);
    expect(found.user.is_active).toBe(1);
    expect(found.tokenHash).toBe(hashSessionToken(token));
  });

  it('only the hash lives in the DB, not the token', () => {
    const { token } = createSession(db, 'u1');
    const row = db.prepare('SELECT token_hash, user_agent FROM user_sessions WHERE user_id = ?').get('u1');
    expect(row.token_hash).toBe(hashSessionToken(token));
    expect(row.token_hash).not.toBe(token);
  });

  it('returns null for unknown tokens', () => {
    expect(findSessionUser(db, 'definitely-not-a-real-token')).toBeNull();
    expect(findSessionUser(db, '')).toBeNull();
    expect(findSessionUser(db, null)).toBeNull();
  });

  it('drops expired rows opportunistically when found via findSessionUser', () => {
    const oneSecondAgo = Date.now() - 1000;
    // Synthesize an expired row by hand.
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const past = new Date(oneSecondAgo - 60_000).toISOString();
    db.prepare(`
      INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(tokenHash, 'u1', past, past, past);

    expect(findSessionUser(db, token)).toBeNull();
    const stillThere = db.prepare('SELECT 1 FROM user_sessions WHERE token_hash = ?').get(tokenHash);
    expect(stillThere).toBeUndefined();
  });
});

describe('touchSession', () => {
  it('does nothing if last_seen_at is fresher than the debounce window', () => {
    const { token } = createSession(db, 'u1');
    const session = findSessionUser(db, token);
    const before = db.prepare('SELECT last_seen_at FROM user_sessions WHERE token_hash = ?').get(session.tokenHash).last_seen_at;
    const refreshed = touchSession(db, session);
    expect(refreshed).toBeNull();
    const after = db.prepare('SELECT last_seen_at FROM user_sessions WHERE token_hash = ?').get(session.tokenHash).last_seen_at;
    expect(after).toBe(before);
  });

  it('updates last_seen_at and expires_at when last_seen is older than the debounce window', () => {
    const { token } = createSession(db, 'u1');
    const session = findSessionUser(db, token);
    // Synthesize "old" lastSeenAt to bypass the debounce.
    const oldNow = Date.now() - SESSION_TOUCH_DEBOUNCE_MS - 1000;
    const stale = { ...session, lastSeenAt: oldNow };

    const refreshed = touchSession(db, stale);
    expect(refreshed).toBeGreaterThan(Date.now());

    const after = db.prepare('SELECT last_seen_at, expires_at FROM user_sessions WHERE token_hash = ?').get(session.tokenHash);
    const lastSeenMs = Date.parse(after.last_seen_at);
    expect(Date.now() - lastSeenMs).toBeLessThan(2000);
  });
});

describe('deleteSessionByToken / deleteUserSessions', () => {
  it('removes one row by token', () => {
    const { token } = createSession(db, 'u1');
    expect(deleteSessionByToken(db, token)).toBe(1);
    expect(findSessionUser(db, token)).toBeNull();
  });

  it('removes all sessions for a user', () => {
    createSession(db, 'u1');
    createSession(db, 'u1');
    createSession(db, 'u1');
    const removed = deleteUserSessions(db, 'u1');
    expect(removed).toBe(3);
  });

  it('removes all sessions except a specified token', () => {
    const a = createSession(db, 'u1');
    const b = createSession(db, 'u1');
    const c = createSession(db, 'u1');
    const removed = deleteUserSessions(db, 'u1', { exceptToken: b.token });
    expect(removed).toBe(2);
    expect(findSessionUser(db, b.token)).not.toBeNull();
    expect(findSessionUser(db, a.token)).toBeNull();
    expect(findSessionUser(db, c.token)).toBeNull();
  });

  it('cascades on user delete (FK)', () => {
    createSession(db, 'u1');
    db.prepare('DELETE FROM users WHERE id = ?').run('u1');
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM user_sessions WHERE user_id = ?').get('u1').c;
    expect(remaining).toBe(0);
  });
});

describe('pruneExpiredSessions', () => {
  it('removes rows whose expires_at is in the past', () => {
    // Fresh session — should survive
    createSession(db, 'u1');
    // Synthesize an expired one
    db.prepare(`
      INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'hash-of-old-token',
      'u2',
      new Date(Date.now() - 1_000_000).toISOString(),
      new Date(Date.now() - 1000).toISOString(),
      new Date(Date.now() - 1000).toISOString()
    );

    const removed = pruneExpiredSessions(db);
    expect(removed).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS c FROM user_sessions').get().c).toBe(1);
  });
});
