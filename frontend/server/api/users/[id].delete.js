import { getDb } from '../../utils/db';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.params.id;
    console.log('API: Deleting user via dedicated endpoint:', userId);
    
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
});
