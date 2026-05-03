import { v4 as uuidv4 } from 'uuid';
import { hashCredential } from './credentials.js';

// Ensures the database has at least one admin user. Called at server startup
// from the bootstrap server-plugin. Pure function w.r.t. its inputs (db + env)
// so unit tests can exercise it against an in-memory db with synthetic env.
//
// Returns:
//   { created: false, reason: 'admin_exists' }
//   { created: true,  id, name }                  on first-run bootstrap
//
// Throws (and the server should refuse to start) if:
//   - No admin row exists AND env.ADMIN_NAME / env.ADMIN_PASSWORD are not both set.
export async function bootstrapAdmin(db, env) {
  const adminCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE isAdmin = 1`).get().c;
  if (adminCount > 0) {
    return { created: false, reason: 'admin_exists' };
  }

  const name = typeof env.ADMIN_NAME === 'string' ? env.ADMIN_NAME.trim() : '';
  const password = typeof env.ADMIN_PASSWORD === 'string' ? env.ADMIN_PASSWORD : '';

  if (!name || !password) {
    throw new Error(
      'SkillGoblin refused to start: no admin account exists and ADMIN_NAME / ' +
      'ADMIN_PASSWORD env vars are not set. Set both in your container environment ' +
      'to create the first admin account, then restart. (See README for the recommended ' +
      'docker-compose snippet.)'
    );
  }

  // Refuse to overwrite a regular account with the same name on a fresh install.
  const collision = db.prepare(`SELECT id FROM users WHERE name = ? COLLATE NOCASE`).get(name);
  if (collision) {
    throw new Error(
      `SkillGoblin refused to start: ADMIN_NAME ("${name}") collides with an existing ` +
      'non-admin user. Either delete that user or pick a different ADMIN_NAME.'
    );
  }

  const id = uuidv4();
  const hashedPassword = await hashCredential(password);
  db.prepare(
    `INSERT INTO users (id, name, password, theme, isAdmin, is_active) VALUES (?, ?, ?, 'dark', 1, 1)`
  ).run(id, name, hashedPassword);

  console.log(`[bootstrap] created first admin "${name}" (${id})`);
  return { created: true, id, name };
}

// Inspect users for credential health and log warnings the operator should
// act on. Specifically: legacy accounts that lost their auth modality with
// the use_auth column drop (no password AND no PIN). They can't log in
// under the new rules until an admin sets credentials for them.
export function reportLegacyCredentialGaps(db, log = console.warn) {
  const legacy = db.prepare(`
    SELECT id, name FROM users
    WHERE (password IS NULL OR password = '')
      AND (pin IS NULL OR pin = '')
  `).all();

  if (legacy.length === 0) return [];

  log(
    `[bootstrap] ${legacy.length} legacy user(s) have no password or PIN and ` +
    'cannot log in under the new auth rules. An admin must set credentials for them ' +
    'from the user-management panel:'
  );
  for (const u of legacy) log(`  - ${u.name} (${u.id})`);
  return legacy;
}
