import { defineEventHandler, getMethod, readBody, getQuery, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireAuth } from '../../utils/authz';

// /api/settings — per-user key/value store. Always operates on the session
// user; the legacy ?userId / body.userId fields are ignored.
//
// (Phase 2 hardening — no callers in the frontend today, but keeping the
// endpoint live for future use, behind proper authz.)
export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const caller = requireAuth(event);
  const db = getDb();

  if (method === 'GET') {
    const { key } = getQuery(event);
    if (!key) {
      return createError({ statusCode: 400, statusMessage: 'Missing required parameter: key' });
    }
    const setting = db.prepare(`
      SELECT value FROM settings WHERE user_id = ? AND key = ?
    `).get(caller.id, key);
    if (!setting) return { value: null };
    try {
      return { value: JSON.parse(setting.value) };
    } catch {
      return { value: setting.value };
    }
  }

  if (method === 'POST') {
    const body = await readBody(event) || {};
    const { key, value } = body;
    if (!key || value === undefined) {
      return createError({ statusCode: 400, statusMessage: 'Missing required parameters: key, value' });
    }
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;
    const existing = db.prepare(`
      SELECT id FROM settings WHERE user_id = ? AND key = ?
    `).get(caller.id, key);

    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND key = ?
      `).run(stringValue, caller.id, key);
    } else {
      db.prepare(`
        INSERT INTO settings (user_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(caller.id, key, stringValue);
    }
    return { success: true };
  }

  if (method === 'DELETE') {
    const { key } = getQuery(event);
    if (!key) {
      return createError({ statusCode: 400, statusMessage: 'Missing required parameter: key' });
    }
    db.prepare(`
      DELETE FROM settings WHERE user_id = ? AND key = ?
    `).run(caller.id, key);
    return { success: true };
  }

  return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
