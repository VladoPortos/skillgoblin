import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/authz';

// GET /api/users/[id]/sessions — admin-only listing of a user's active
// sessions. Used by the admin panel's "view sessions / kick" drilldown.
//
// Response shape: array of { user_agent, created_at, last_seen_at, expires_at }.
// token_hash is intentionally NOT exposed — admins only need session metadata,
// and even though sha256 is one-way the principle is to leak the minimum.
export default defineEventHandler((event) => {
  requireAdmin(event);

  const userId = event.context.params.id;
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' });
  }

  // Filter out expired rows. The session middleware already prunes them
  // opportunistically on next access, but a kicked-target with no further
  // requests can leave stale rows; we don't want them in the admin view.
  // Compare ISO strings — created_at / expires_at are written via
  // CURRENT_TIMESTAMP / new Date().toISOString() in sessions.js.
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT user_agent, created_at, last_seen_at, expires_at
    FROM user_sessions
    WHERE user_id = ? AND expires_at > ?
    ORDER BY COALESCE(last_seen_at, created_at) DESC
  `).all(userId, nowIso);
});
