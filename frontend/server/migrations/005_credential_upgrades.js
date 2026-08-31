export default {
  name: '005_credential_upgrades',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS credential_upgrades (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_credential_upgrades_user_id
        ON credential_upgrades(user_id);
      CREATE INDEX IF NOT EXISTS idx_credential_upgrades_expires_at
        ON credential_upgrades(expires_at);
    `);
  }
};
