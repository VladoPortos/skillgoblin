import { defineEventHandler, readBody, createError, deleteCookie } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import { ensureNotLastAdmin } from '../../utils/lastAdminGuard';
import { SESSION_COOKIE } from '../../middleware/session';

// POST /api/users/delete  Body: { userId }
// Delete an account. Requires a session.
//   - Self-delete: any user can remove their own account (modulo last-admin
//     protection — they cannot if they are the only admin).
//   - Admin-delete: an admin can remove anyone, again modulo last-admin
//     protection.
// Cascades: user_sessions (FK ON DELETE CASCADE), settings (FK ON DELETE
// CASCADE), user_progress (no FK — wiped explicitly).
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event) || {};
    const userId = body.userId;

    if (!userId) {
      return createError({ statusCode: 400, statusMessage: 'User ID is required' });
    }

    const caller = requireSelfOrAdmin(event, userId);
    const isSelfDelete = caller.id === userId;

    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return createError({ statusCode: 404, statusMessage: 'User not found' });
    }

    ensureNotLastAdmin(db, userId, 'delete');

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM user_progress WHERE user_id = ?').run(userId);
      // settings + user_sessions are removed automatically by ON DELETE CASCADE
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      if (result.changes === 0) {
        db.exec('ROLLBACK');
        return createError({ statusCode: 500, statusMessage: 'Failed to delete user' });
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    // If the caller deleted themselves, drop their session cookie too so
    // the next request doesn't try to log in with a now-orphan token.
    if (isSelfDelete) {
      deleteCookie(event, SESSION_COOKIE, { path: '/' });
    }

    return { success: true, message: 'User deleted successfully' };
  } catch (error) {
    if (error?.statusCode) throw error;
    console.error('Error deleting user:', error);
    return createError({ statusCode: 500, statusMessage: 'Failed to delete user' });
  }
});
