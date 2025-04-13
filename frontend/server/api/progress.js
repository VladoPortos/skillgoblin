import { getDb } from '../utils/db';
import { defineEventHandler, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  // GET request - Get user's progress for all courses or a specific course
  if (event.node.req.method === 'GET') {
    const query = getQuery(event);
    const userId = parseInt(query.userId);
    const courseId = query.courseId;
    
    if (!userId) {
      return { statusCode: 400, body: { error: 'User ID is required' } };
    }
    
    try {
      let progress;
      if (courseId) {
        // Get progress for a specific course
        progress = getDb().prepare(`
          SELECT course_id, lesson_id, video_index, progress, completed, last_position 
          FROM user_progress 
          WHERE user_id = ? AND course_id = ?
        `).all(userId, courseId);
      } else {
        // Get progress for all courses
        progress = getDb().prepare(`
          SELECT course_id, lesson_id, video_index, progress, completed, last_position 
          FROM user_progress 
          WHERE user_id = ?
        `).all(userId);
      }
      
      // Format the response to be more usable by the frontend
      const formattedProgress = progress.reduce((result, item) => {
        const key = `${item.course_id}-${item.lesson_id}-${item.video_index}`;
        result[key] = {
          progress: item.progress,
          completed: item.completed === 1,
          lastPosition: item.last_position
        };
        return result;
      }, {});
      
      return formattedProgress;
    } catch (error) {
      console.error('Error fetching progress:', error);
      return { statusCode: 500, body: { error: 'Failed to fetch progress' } };
    }
  }
  
  // POST request - Update user's progress
  if (event.node.req.method === 'POST') {
    try {
      const body = await readBody(event);
      
      // Validate required fields
      if (!body.userId || !body.courseId || !body.lessonId || body.videoIndex === undefined) {
        return { statusCode: 400, body: { error: 'Missing required fields' } };
      }
      
      // Prepare data for update
      const { userId, courseId, lessonId, videoIndex, progress, completed, lastPosition } = body;
      
      // Update or insert progress
      const stmt = getDb().prepare(`
        INSERT INTO user_progress (user_id, course_id, lesson_id, video_index, progress, completed, last_position, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, course_id, lesson_id, video_index) 
        DO UPDATE SET 
          progress = ?,
          completed = ?,
          last_position = ?,
          updated_at = CURRENT_TIMESTAMP
      `);
      
      const completedValue = completed ? 1 : 0;
      stmt.run(
        userId, courseId, lessonId, videoIndex, progress, completedValue, lastPosition,
        progress, completedValue, lastPosition
      );
      
      return { success: true };
    } catch (error) {
      console.error('Error updating progress:', error);
      return { statusCode: 500, body: { error: 'Failed to update progress' } };
    }
  }
  
  return { statusCode: 405, body: { error: 'Method not allowed' } };
});
