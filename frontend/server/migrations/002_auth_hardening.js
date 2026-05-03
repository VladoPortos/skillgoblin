// Auth hardening schema changes:
//   - Add `is_active` to users (default 1 so existing users keep working;
//     new accounts honor the system_settings.auto_approve_new_users flag,
//     not this default).
//   - Drop `use_auth` (every user from now on must have password or PIN —
//     enforced at the app level on create/update; the DB allows NULL/NULL
//     only for legacy rows whose owners will be prompted to set credentials
//     on next login).
//   - Add `user_sessions` for cookie-backed sessions. One row per device.
//   - Add `system_settings` key/value table for global toggles owned by
//     admins (auto_approve_new_users, allow_pin, ...).
//   - Seed default values for the two settings we know we'll need.
//
// SQLite ≥ 3.35 supports `ALTER TABLE ... DROP COLUMN`. The version that
// ships in node:18-alpine via better-sqlite3 9.x is 3.42+, so this is safe.
export default {
  name: '002_auth_hardening',
  up(db) {
    const userColumns = db
      .prepare(`SELECT name FROM pragma_table_info('users')`)
      .all()
      .map(r => r.name);

    if (!userColumns.includes('is_active')) {
      db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`);
    }

    if (userColumns.includes('use_auth')) {
      db.exec(`ALTER TABLE users DROP COLUMN use_auth`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed defaults only if the row doesn't already exist — repeated runs of
    // this migration during testing must not clobber an admin-edited value.
    const seedSetting = db.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`
    );
    seedSetting.run('auto_approve_new_users', 'false');
    seedSetting.run('allow_pin', 'true');
  }
};
