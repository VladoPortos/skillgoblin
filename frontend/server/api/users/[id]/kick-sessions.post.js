import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { requireAdmin } from '../../../utils/authz';
import { deleteUserSessions } from '../../../utils/sessions';

// POST /api/users/[id]/kick-sessions — admin-only force-logout of every
// session for the target user. Used by the admin panel.
//
// No last-admin protection: kicking sessions doesn't change role or active
// state, only forces re-login. An admin self-kicking is allowed; their own
// cookie becomes useless on the next request, which is the expected UX.
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

  const kicked = deleteUserSessions(db, userId);
  return { success: true, kicked };
});
