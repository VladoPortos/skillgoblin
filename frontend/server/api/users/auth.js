import { getDb } from '../../utils/db';
import { defineEventHandler, readBody, createError } from 'h3';

export default defineEventHandler(async (event) => {
  if (event.node.req.method !== 'POST') {
    return createError({
      statusCode: 405,
      statusMessage: 'Method Not Allowed'
    });
  }

  try {
    const body = await readBody(event);
    const { userId, password, pin } = body;

    if (!userId) {
      return createError({
        statusCode: 400,
        statusMessage: 'User ID is required'
      });
    }

    // Get user from database
    const db = getDb();
    const user = db.prepare('SELECT id, password, pin, use_auth FROM users WHERE id = ?').get(userId);

    if (!user) {
      return createError({
        statusCode: 404,
        statusMessage: 'User not found'
      });
    }

    // If user doesn't require authentication, return success
    if (user.use_auth === 0) {
      return { success: true };
    }

    // Check if password or PIN is provided and matches
    if (password && password === user.password) {
      return { success: true };
    }

    if (pin && pin === user.pin) {
      return { success: true };
    }

    return { 
      success: false, 
      message: 'Invalid credentials'
    };

  } catch (error) {
    console.error('Error authenticating user:', error);
    return createError({
      statusCode: 500,
      statusMessage: 'Authentication failed'
    });
  }
});
