import fs from 'fs';
import { defineEventHandler, readBody, getMethod, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import { getContentDir, generateCourseId } from '../../utils/courseHelpers';

// /api/user-progress/[userId]
//   GET  — read the user's progress JSON blob
//   POST — patch one course's progress in that blob
// Auth: caller must be the user OR an admin. Admins can read/write any
// user's progress (useful for support / debugging from the admin panel).
export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const userId = event.context.params.userId;
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' });
  }

  requireSelfOrAdmin(event, userId);

  const db = getDb();

  if (method === 'GET') {
    try {
      const result = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
      if (!result) return { progress: {} };

      const progress = JSON.parse(result.progress);

      // Drop progress entries for courses that no longer exist on disk.
      const contentDir = getContentDir();
      let courseDirs = [];
      try {
        courseDirs = fs.readdirSync(contentDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => generateCourseId(d.name));
      } catch (err) {
        // If the content dir doesn't exist yet, just return everything.
        return { progress };
      }

      const cleaned = {};
      for (const courseId of Object.keys(progress)) {
        if (courseDirs.includes(courseId)) cleaned[courseId] = progress[courseId];
      }
      return { progress: cleaned };
    } catch (error) {
      console.error('Error fetching user progress:', error);
      throw createError({ statusCode: 500, statusMessage: 'Failed to fetch user progress' });
    }
  }

  if (method === 'POST') {
    try {
      const body = await readBody(event);
      if (!body?.courseId || !body.data) {
        throw createError({ statusCode: 400, statusMessage: 'Course ID and progress data are required' });
      }

      const existing = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
      const progress = existing ? JSON.parse(existing.progress) : {};
      progress[body.courseId] = body.data;

      if (existing) {
        db.prepare('UPDATE user_progress SET progress = ? WHERE user_id = ?')
          .run(JSON.stringify(progress), userId);
      } else {
        db.prepare('INSERT INTO user_progress (user_id, progress) VALUES (?, ?)')
          .run(userId, JSON.stringify(progress));
      }

      return { success: true, progress };
    } catch (error) {
      if (error?.statusCode) throw error;
      console.error('Error updating user progress:', error);
      throw createError({ statusCode: 500, statusMessage: 'Failed to update user progress' });
    }
  }

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' });
});
