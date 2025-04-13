import { getDb } from '../../utils/db';
import { defineEventHandler, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;
  const userId = event.context.params.id;

  if (!userId) {
    return createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    });
  }

  // GET method - fetch a specific user
  if (method === 'GET') {
    try {
      console.log('API: Fetching user:', userId);
      
      // Get user with auth type information (has_password, has_pin)
      const db = getDb();
      const user = db.prepare(`
        SELECT id, name, avatar, use_auth, isAdmin,
        CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END as has_password,
        CASE WHEN pin IS NOT NULL AND pin != '' THEN 1 ELSE 0 END as has_pin
        FROM users WHERE id = ?
      `).get(userId);
      
      if (!user) {
        return createError({
          statusCode: 404,
          statusMessage: 'User not found'
        });
      }
      
      return user;
    } catch (error) {
      console.error('Error fetching user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch user'
      });
    }
  }

  // PUT method - update a user
  if (method === 'PUT') {
    // Existing PUT implementation...
  }

  // DELETE method - delete a user
  if (method === 'DELETE') {
    // Existing DELETE implementation...
  }

  return createError({
    statusCode: 405,
    statusMessage: 'Method Not Allowed'
  });
});
