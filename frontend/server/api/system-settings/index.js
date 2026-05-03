import { defineEventHandler, readBody, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireAdmin } from '../../utils/authz';

// /api/system-settings — read or update global app settings.
//
//   GET  — public. The signup screen (pre-login) needs to know whether
//          PINs are allowed to decide whether to show the PIN input.
//          Values exposed here are not sensitive (boolean toggles only).
//   PUT  — admin only. Body: { key, value }. The value is coerced to the
//          string form the migrations seed and the rest of the codebase
//          expect ('true' | 'false').
//
// Allowing arbitrary keys would let an admin (or a successful XSS) pollute
// the table; we maintain an explicit whitelist of editable keys here.
const KNOWN_SETTINGS = new Set([
  'allow_pin',
  'auto_approve_new_users'
]);

function readAll(db) {
  const rows = db.prepare('SELECT key, value FROM system_settings').all();
  const map = {};
  for (const row of rows) {
    if (KNOWN_SETTINGS.has(row.key)) map[row.key] = row.value;
  }
  // Apply seed defaults for any setting that exists in code but not yet in
  // the DB (defense in depth — should not happen post-migration).
  if (!('allow_pin' in map)) map.allow_pin = 'true';
  if (!('auto_approve_new_users' in map)) map.auto_approve_new_users = 'false';
  return map;
}

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  if (method === 'GET') {
    const db = getDb();
    return readAll(db);
  }

  if (method === 'PUT') {
    requireAdmin(event);
    const body = (await readBody(event)) || {};
    const key = String(body.key || '');
    if (!KNOWN_SETTINGS.has(key)) {
      return createError({ statusCode: 400, statusMessage: 'Unknown setting key' });
    }
    // Boolean settings only, for now. Coerce to canonical string form.
    let value;
    if (typeof body.value === 'boolean') value = body.value ? 'true' : 'false';
    else if (body.value === 'true' || body.value === 'false') value = body.value;
    else return createError({ statusCode: 400, statusMessage: 'Value must be boolean or "true" / "false"' });

    const db = getDb();
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);

    return readAll(db);
  }

  return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
