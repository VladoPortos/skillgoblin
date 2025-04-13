import fs from 'fs';
import path from 'path';
import { defineEventHandler, readBody, getMethod, createError } from 'h3';
import { getDb } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const userId = event.context.params.userId;
  
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    });
  }
  
  const db = getDb();
  
  // GET - Retrieve user progress
  if (method === 'GET') {
    try {
      // Check if progress exists for this user
      const stmt = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?');
      const result = stmt.get(userId);
      
      if (!result) {
        return { progress: {} };
      }
      
      // Parse the JSON progress data
      const progress = JSON.parse(result.progress);
      
      // Clean up progress for courses that no longer exist
      const contentDir = path.resolve(process.cwd(), '/app/data/content');
      const courseDirs = fs.readdirSync(contentDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => {
          // Generate course ID from directory name
          return dirent.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        });
      
      // Remove progress for courses that no longer exist
      const cleanedProgress = {};
      Object.keys(progress).forEach(courseId => {
        if (courseDirs.includes(courseId)) {
          cleanedProgress[courseId] = progress[courseId];
        }
      });
      
      return { progress: cleanedProgress };
    } catch (error) {
      console.error('Error fetching user progress:', error);
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch user progress'
      });
    }
  }
  
  // POST - Update user progress
  if (method === 'POST') {
    try {
      const body = await readBody(event);
      
      if (!body.courseId || !body.data) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Course ID and progress data are required'
        });
      }
      
      // Get current progress
      const stmt = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?');
      const result = stmt.get(userId);
      
      let progress = {};
      if (result) {
        progress = JSON.parse(result.progress);
      }
      
      // Update progress for the specified course
      progress[body.courseId] = body.data;
      
      // Save updated progress
      if (result) {
        const updateStmt = db.prepare('UPDATE user_progress SET progress = ? WHERE user_id = ?');
        updateStmt.run(JSON.stringify(progress), userId);
      } else {
        const insertStmt = db.prepare('INSERT INTO user_progress (user_id, progress) VALUES (?, ?)');
        insertStmt.run(userId, JSON.stringify(progress));
      }
      
      return { success: true, progress };
    } catch (error) {
      console.error('Error updating user progress:', error);
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update user progress'
      });
    }
  }
  
  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  });
});
