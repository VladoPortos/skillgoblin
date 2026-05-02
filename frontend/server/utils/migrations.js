import defaultMigrations from '../migrations/index.js';

// Forward-only migration runner.
// On every boot:
//   1. Ensures the `migrations` bookkeeping table exists.
//   2. For each migration in the manifest, applies it inside a transaction if
//      its name is not already recorded. Records the name on success.
//   3. Throws on the first failure so the app refuses to start with a half-applied DB.
//
// The optional `migrations` argument exists for tests; production always uses
// the manifest in `frontend/server/migrations/index.js`.
export function runMigrations(db, migrations = defaultMigrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all().map(r => r.name)
  );

  const insertApplied = db.prepare('INSERT INTO migrations (name) VALUES (?)');

  for (const migration of migrations) {
    if (!migration?.name || typeof migration.up !== 'function') {
      throw new Error(`Invalid migration entry: ${JSON.stringify(migration)}`);
    }
    if (applied.has(migration.name)) continue;

    console.log(`[migrations] applying ${migration.name}`);
    db.exec('BEGIN');
    try {
      migration.up(db);
      insertApplied.run(migration.name);
      db.exec('COMMIT');
      console.log(`[migrations] ✓ ${migration.name}`);
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(`[migrations] ✗ ${migration.name} failed:`, err);
      throw err;
    }
  }
}
