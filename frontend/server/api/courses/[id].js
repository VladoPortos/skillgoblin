import { defineEventHandler, getMethod, readBody } from 'h3';
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
            const courseData = generateCourseJson(courseDir, coursePath);
            
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
  
  // POST - Update course data or refresh from filesystem
  if (method === 'POST') {
    try {
      const body = await readBody(event);
      
      if (body.action === 'refresh') {
        // Get the folder name for this course
        const course = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
        
        if (!course) {
          return { error: 'Course not found' };
        }
        
        const coursePath = path.join(contentDir, course.folder_name);
        
        if (!fs.existsSync(coursePath)) {
          return { error: 'Course directory not found' };
        }
        
        // Regenerate course data
        const courseData = generateCourseJson(course.folder_name, coursePath);
        
        if (courseData) {
          // Save to database
          saveCourseToDb(courseData, course.folder_name);
          return courseData;
        } else {
          return { error: 'Failed to refresh course data' };
        }
      } else if (body.action === 'update') {
        // Update course metadata
        if (!body.courseData) {
          return { error: 'Course data is required' };
        }
        
        const courseData = body.courseData;
        
        // Get the existing course to get the folder name
        const existingCourse = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
        
        if (!existingCourse) {
          return { error: 'Course not found' };
        }
        
        // Update the course in the database
        db.prepare(`
          UPDATE courses 
          SET title = ?, description = ?, thumbnail = ?, data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(
          courseData.title,
          courseData.description,
          courseData.thumbnail,
          JSON.stringify(courseData),
          courseId
        );
        
        return { success: true, message: 'Course updated successfully' };
      }
      
      return { error: 'Invalid action' };
    } catch (error) {
      console.error('Error processing request:', error);
      return { error: 'Failed to process request' };
    }
  }
  
  return { error: 'Method not allowed' };
});
