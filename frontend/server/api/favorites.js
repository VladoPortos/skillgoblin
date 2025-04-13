import { getDb } from '../utils/db';
import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  // GET request - Get user's favorite courses
  if (event.node.req.method === 'GET') {
    const query = getQuery(event);
    const userId = parseInt(query.userId);
    
    if (!userId) {
      return { statusCode: 400, body: { error: 'User ID is required' } };
    }
    
    try {
      const db = await getDb();
      const favorites = db.prepare('SELECT course_id FROM user_favorites WHERE user_id = ?').all(userId);
      return favorites.map(fav => fav.course_id);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      return { statusCode: 500, body: { error: 'Failed to fetch favorites' } };
    }
  }
  
  // POST request - Add or remove a favorite
  if (event.node.req.method === 'POST') {
    try {
      const body = await readBody(event);
      
      // Validate required fields
      if (!body.userId || !body.courseId) {
        return { statusCode: 400, body: { error: 'Missing required fields' } };
      }
      
      const { userId, courseId, isFavorite } = body;
      
      const db = await getDb();
      
      if (isFavorite) {
        // Add favorite
        db.prepare('INSERT OR IGNORE INTO user_favorites (user_id, course_id) VALUES (?, ?)').run(userId, courseId);
      } else {
        // Remove favorite
        db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND course_id = ?').run(userId, courseId);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating favorites:', error);
      return { statusCode: 500, body: { error: 'Failed to update favorites' } };
    }
  }
  
  return { statusCode: 405, body: { error: 'Method not allowed' } };
});
