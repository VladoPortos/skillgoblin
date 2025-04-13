import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Get database path from config
const config = useRuntimeConfig();
const dbPath = config.databasePath;

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  console.log(`Creating database directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Using database path: ${dbPath}`);

// Initialize database connection
let db = null;

// Function to get the database instance
export function getDb() {
  if (!db) {
    db = new BetterSqlite3(dbPath);
    initDatabase();
  }
  return db;
}

// Create tables if they don't exist
function initDatabase() {
  console.log('Initializing database schema...');
  
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      theme TEXT DEFAULT 'dark',
      password TEXT,
      pin TEXT,
      use_auth INTEGER DEFAULT 0,
      isAdmin INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      progress TEXT DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );
    
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      folder_name TEXT NOT NULL,
      thumbnail TEXT,
      thumbnail_data BLOB,
      category TEXT DEFAULT 'Uncategorized',
      release_date TEXT,
      data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    );
  `);
  
  // Check if thumbnail_data column exists in courses table, add it if it doesn't
  const hasColumn = db.prepare(`
    SELECT COUNT(*) as count 
    FROM pragma_table_info('courses') 
    WHERE name = 'thumbnail_data'
  `).get();
  
  if (hasColumn.count === 0) {
    console.log('Adding thumbnail_data column to courses table...');
    try {
      db.exec(`
        ALTER TABLE courses 
        ADD COLUMN thumbnail_data BLOB;
      `);
      console.log('Successfully added thumbnail_data column');
    } catch (error) {
      console.error('Error adding thumbnail_data column:', error);
    }
  }
  
  console.log('Database schema initialized');
}

// Initialize the database on startup
getDb();
