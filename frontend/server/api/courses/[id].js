import { defineEventHandler, getMethod } from 'h3';
import { getDb } from '../../utils/db';
import path from 'path';
import fs from 'fs';

// Import the helper functions from the new modular structure
import { generateCourseId, getContentDir } from '../../utils/courseHelpers';
import { generateCourseJson } from '../../utils/courseGenerator';
import { saveCourseToDb } from '../../utils/courseDatabase';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  const courseId = event.context.params.id;
  const contentDir = getContentDir();
  const db = getDb();

  // GET - Retrieve a specific course
  if (method === 'GET') {
    try {
      // First try to get from database
      const course = db.prepare('SELECT data FROM courses WHERE id = ?').get(courseId);

      if (course) {
        return JSON.parse(course.data);
      } else {
        // If not in database, try to find it in the filesystem
        const courseDirs = fs.readdirSync(contentDir, { withFileTypes: true })
          .filter(item => item.isDirectory())
          .map(item => item.name);

        for (const courseDir of courseDirs) {
          const generatedId = generateCourseId(courseDir);

          if (generatedId === courseId) {
            const coursePath = path.join(contentDir, courseDir);
            const courseData = await generateCourseJson(courseDir, coursePath);

            if (courseData) {
              // Save to database for future use
              saveCourseToDb(courseData, courseDir);
              return courseData;
            }
          }
        }

        return { error: 'Course not found' };
      }
    } catch (error) {
      console.error(`Error retrieving course ${courseId}:`, error);
      return { error: 'Failed to retrieve course' };
    }
  }

  return { error: 'Method not allowed' };
});
