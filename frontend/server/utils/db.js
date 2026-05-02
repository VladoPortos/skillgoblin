import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations.js';

const config = useRuntimeConfig();
const dbPath = config.databasePath;

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  console.log(`Creating database directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Using database path: ${dbPath}`);

let db = null;

export function getDb() {
  if (!db) {
    db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

getDb();
