import { defineEventHandler, readBody, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireAuth } from '../../utils/authz';

// /api/users/theme — GET or POST the current user's theme preference.
// Always operates on the session user; the legacy ?userId / body.userId
// fields are ignored.
export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const caller = requireAuth(event);
  const db = getDb();

  if (method === 'GET') {
    const row = db.prepare('SELECT theme FROM users WHERE id = ?').get(caller.id);
    return { theme: row?.theme || 'dark' };
  }

  if (method === 'POST') {
    const body = await readBody(event) || {};
    const theme = body.theme;
    if (theme !== 'dark' && theme !== 'light') {
      return createError({ statusCode: 400, statusMessage: 'Theme must be "dark" or "light"' });
    }
    db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, caller.id);
    return { success: true, theme };
  }

  return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
