import { getDb } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  // GET: Get user theme preference
  if (method === 'GET') {
    const query = getQuery(event);
    const { userId } = query;

    if (!userId) {
      return { error: 'User ID is required' };
    }

    try {
      const db = await getDb();
      const user = db.prepare('SELECT theme FROM users WHERE id = ?').get(userId);
      
      if (!user) {
        return { error: 'User not found' };
      }

      return { theme: user.theme || 'dark' };
    } catch (error) {
      console.error('Error fetching user theme:', error);
      return { error: 'Failed to fetch user theme preferences' };
    }
  }

  // POST: Update user theme preference
  if (method === 'POST') {
    const body = await readBody(event);
    const { userId, theme } = body;

    if (!userId || !theme) {
      return { error: 'User ID and theme are required' };
    }

    if (theme !== 'dark' && theme !== 'light') {
      return { error: 'Theme must be either "dark" or "light"' };
    }

    try {
      const db = await getDb();
      const result = db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, userId);
      
      if (result.changes === 0) {
        return { error: 'User not found or no changes made' };
      }

      return { success: true, theme };
    } catch (error) {
      console.error('Error updating user theme:', error);
      return { error: 'Failed to update user theme preferences' };
    }
  }

  return { error: 'Method not allowed' };
});
