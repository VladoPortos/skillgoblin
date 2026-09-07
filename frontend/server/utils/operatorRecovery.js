import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import migrations from '../migrations/index.js';
import { hashCredential } from './credentials.js';
import { deleteUserSessions } from './sessions.js';

export function validateDatabase(db) {
  const integrity = db.pragma('integrity_check');
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('Database integrity check failed');
  if (db.pragma('foreign_key_check').length) throw new Error('Database contains broken foreign keys');
  for (const table of ['users', 'courses', 'user_progress', 'migrations']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error(`Not a SkillGoblin database: missing ${table}`);
  }
  db.prepare('SELECT id,name,password,pin FROM users LIMIT 0').all();
  db.prepare('SELECT id,data,folder_name FROM courses LIMIT 0').all();
  db.prepare('SELECT user_id,progress FROM user_progress LIMIT 0').all();
  const known = new Set(migrations.map(m => m.name));
  const applied = db.prepare('SELECT name FROM migrations').all();
  if (!applied.length || applied.some(m => !known.has(m.name))) throw new Error('Unsupported database migration version; use the matching or newer application image');
}

export async function backupDatabase(source, destination) {
  source = path.resolve(source); destination = path.resolve(destination);
  if (source === destination) throw new Error('Backup destination must differ from source');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  // Reserve the destination without ever replacing an existing backup.
  const fd = fs.openSync(destination, 'wx', 0o600); fs.closeSync(fd);
  let db;
  try {
    db = new Database(source, { readonly: true, fileMustExist: true });
    await db.backup(destination);
    const snapshot = new Database(destination, { readonly: true, fileMustExist: true });
    try { validateDatabase(snapshot); } finally { snapshot.close(); }
    return destination;
  } catch (error) {
    fs.rmSync(destination, { force: true });
    throw error;
  } finally { db?.close(); }
}

export async function restoreDatabase(source, destination, { offline = false } = {}) {
  if (!offline) throw new Error('Restore requires --offline and all application processes stopped');
  source = path.resolve(source); destination = path.resolve(destination);
  if (source === destination) throw new Error('Restore source must differ from destination');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const suffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const staged = `${destination}.restore-${suffix}`;
  let safetyBackup = null;
  try {
    // Validate a consistent, private snapshot before touching the target.
    await backupDatabase(source, staged);
    const restored = new Database(staged);
    try {
      restored.transaction(() => {
        for (const table of ['user_sessions', 'credential_upgrades']) {
          if (restored.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) restored.exec('DELETE FROM ' + table);
        }
      })();
      restored.pragma('wal_checkpoint(TRUNCATE)');
      restored.pragma('journal_mode=DELETE');
    } finally { restored.close(); }
    if (fs.existsSync(destination)) {
      safetyBackup = `${destination}.before-restore-${suffix}.sqlite`;
      await backupDatabase(destination, safetyBackup);
      const old = new Database(destination, { fileMustExist: true });
      try {
        const checkpoint = old.pragma('wal_checkpoint(TRUNCATE)');
        if (checkpoint.some(row => row.busy)) throw new Error('Database is busy; stop every application process before restoring');
      } finally { old.close(); }
    }
    // Offline only: sidecars belong to the previous database, never the snapshot.
    for (const ext of ['-wal', '-shm']) fs.rmSync(destination + ext, { force: true });
    fs.renameSync(staged, destination);
    return { database: destination, safetyBackup };
  } finally { fs.rmSync(staged, { force: true }); }
}

export async function resetPassword(db, userId, password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('Password must contain 12 to 1024 characters');
  const hash = await hashCredential(password);
  db.transaction(() => {
    const result = db.prepare('UPDATE users SET password = ?, pin = NULL WHERE id = ?').run(hash, userId);
    if (result.changes !== 1) throw new Error('User ID not found');
    deleteUserSessions(db, userId);
  }).immediate();
}
