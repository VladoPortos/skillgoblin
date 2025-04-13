import { getDb } from '../../utils/db';
import { v4 as uuidv4 } from 'uuid';
import { defineEventHandler, readBody, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  // GET method - fetch users
  if (method === 'GET') {
    try {
      console.log('API: Fetching all users');
      const db = getDb();
      const users = db.prepare('SELECT id, name, avatar, use_auth, isAdmin FROM users ORDER BY created_at DESC').all();
      console.log('API: Found users:', users);
      
      // Ensure we're always returning an array, even if empty
      return users || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch users'
      });
    }
  }

  // POST method - create a new user
  if (method === 'POST') {
    try {
      const body = await readBody(event);
      
      // Validate required fields
      if (!body.name || body.name.trim() === '') {
        return createError({
          statusCode: 400,
          statusMessage: 'Username is required'
        });
      }
      
      // Check if a user with the same name already exists
      const db = getDb();
      const existingUser = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(body.name.trim());
      if (existingUser) {
        console.log('User with this name already exists:', body.name);
        return createError({
          statusCode: 409,
          statusMessage: 'A user with this name already exists'
        });
      }
      
      // Generate a unique ID for the new user
      const userId = uuidv4();
      
      // Insert the new user
      const stmt = db.prepare(`
        INSERT INTO users (id, name, avatar, password, pin, use_auth, theme, isAdmin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        userId,
        body.name.trim(),
        body.avatar || null,
        body.password || null, 
        body.pin || null,
        body.use_auth || 0,
        'dark', // Default theme is dark
        body.isAdmin || 0
      );

      if (result.changes === 1) {
        const newUser = db.prepare('SELECT id, name, avatar, use_auth, isAdmin FROM users WHERE id = ?').get(userId);
        return newUser;
      } else {
        return createError({
          statusCode: 500,
          statusMessage: 'Failed to create user'
        });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to create user'
      });
    }
  }

  // PUT method - update a user
  if (method === 'PUT') {
    try {
      const body = await readBody(event);
      
      console.log('API: Updating user:', body);
      
      if (!body.id) {
        console.error('API: User ID is missing in update request');
        return createError({
          statusCode: 400,
          statusMessage: 'User ID is required'
        });
      }

      if (!body.name || body.name.trim() === '') {
        console.error('API: User name is missing in update request');
        return createError({
          statusCode: 400,
          statusMessage: 'Name is required'
        });
      }

      const db = getDb();
      
      // First check if user exists
      const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(body.id);
      if (!userExists) {
        console.error('API: User not found with ID:', body.id);
        return createError({
          statusCode: 404,
          statusMessage: 'User not found'
        });
      }
      
      const fields = [
        'name = ?',
        'avatar = ?',
        'use_auth = ?',
        'isAdmin = ?',
      ];
      
      const params = [
        body.name.trim(),
        body.avatar || null,
        body.use_auth || 0,
        body.isAdmin !== undefined ? body.isAdmin : 0,
      ];

      // Only update password or PIN if they're provided
      if (body.password !== undefined) {
        fields.push('password = ?');
        params.push(body.password || null);
      }

      if (body.pin !== undefined) {
        fields.push('pin = ?');
        params.push(body.pin || null);
      }

      // Add the user ID to the params
      params.push(body.id);

      const query = `
        UPDATE users 
        SET ${fields.join(', ')}
        WHERE id = ?
      `;
      
      console.log('API: Executing update query:', query.replace(/\s+/g, ' '));

      const stmt = db.prepare(query);
      const result = stmt.run(...params);
      
      console.log('API: Update result:', result);

      if (result.changes === 1) {
        const updatedUser = db.prepare('SELECT id, name, avatar, use_auth, isAdmin FROM users WHERE id = ?').get(body.id);
        console.log('API: User updated successfully:', updatedUser);
        return updatedUser;
      } else {
        console.error('API: User not found or no changes made for ID:', body.id);
        return createError({
          statusCode: 404,
          statusMessage: 'User not found or no changes made'
        });
      }
    } catch (error) {
      console.error('API: Error updating user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to update user: ' + error.message
      });
    }
  }

  // DELETE method - delete a user
  if (method === 'DELETE') {
    try {
      const userId = event.context.params.id;
      console.log('API: Deleting user:', userId);
      
      if (!userId) {
        return createError({
          statusCode: 400,
          statusMessage: 'User ID is required'
        });
      }
      
      // Check if user exists
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) {
        console.error('User not found:', userId);
        return createError({
          statusCode: 404,
          statusMessage: 'User not found'
        });
      }
      
      // Begin a transaction to delete the user and all related data
      db.exec('BEGIN TRANSACTION');
      
      try {
        // Delete user progress
        const progressResult = db.prepare('DELETE FROM user_progress WHERE user_id = ?').run(userId);
        console.log('Deleted user progress records:', progressResult.changes);
        
        // Delete user favorites
        const favoritesResult = db.prepare('DELETE FROM user_favorites WHERE user_id = ?').run(userId);
        console.log('Deleted user favorites records:', favoritesResult.changes);
        
        // Finally, delete the user
        const userResult = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
        
        if (userResult.changes > 0) {
          db.exec('COMMIT');
          console.log('User deleted successfully:', userId);
          return { success: true, message: 'User deleted successfully' };
        } else {
          db.exec('ROLLBACK');
          console.error('Failed to delete user:', userId);
          return createError({
            statusCode: 500,
            statusMessage: 'Failed to delete user'
          });
        }
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to delete user'
      });
    }
  }

  return createError({
    statusCode: 405,
    statusMessage: 'Method Not Allowed'
  });
});
