// Captures the schema as it exists on `main` prior to the auth-hardening round.
// On a fresh install, this creates every table from scratch.
// On an upgraded install, every CREATE is a no-op (the tables already exist), and
// the defensive ALTER picks up the case where an old install never ran the inline
// thumbnail_data migration that used to live in db.js.
export default {
  name: '001_initial',
  up(db) {
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

    const hasThumb = db.prepare(
      `SELECT COUNT(*) AS count FROM pragma_table_info('courses') WHERE name = 'thumbnail_data'`
    ).get();
    if (hasThumb.count === 0) {
      db.exec(`ALTER TABLE courses ADD COLUMN thumbnail_data BLOB`);
    }
  }
};
