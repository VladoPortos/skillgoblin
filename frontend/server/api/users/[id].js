import { getDb } from '../../utils/db';
import { defineEventHandler, createError } from 'h3';

// GET /api/users/[id] — fetch a single user with auth-presence flags.
// Updates and deletes go through their own endpoints (PUT /api/users,
// POST /api/users/delete) and are not handled here.
export default defineEventHandler(async (event) => {
  if (event.node.req.method !== 'GET') {
    return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
  }

  const userId = event.context.params.id;
  if (!userId) {
    return createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }

  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT id, name, avatar, use_auth, isAdmin,
             CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
             CASE WHEN pin      IS NOT NULL AND pin      != '' THEN 1 ELSE 0 END AS has_pin
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return createError({ statusCode: 404, statusMessage: 'User not found' });
    }
    return user;
  } catch (error) {
    console.error('Error fetching user:', error);
    return createError({ statusCode: 500, statusMessage: 'Failed to fetch user' });
  }
});
