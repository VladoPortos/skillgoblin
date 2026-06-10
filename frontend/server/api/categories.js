import { defineEventHandler, createError } from 'h3';
import { getDb } from '../utils/db';

export default defineEventHandler(async (event) => {
  const db = getDb();
  
  // Get all courses
  const categories = new Set();
  
  try {
    // Extract all unique categories from courses
    const courses = db.prepare('SELECT data FROM courses').all();
    
    courses.forEach(course => {
      try {
        const courseData = JSON.parse(course.data);
        if (courseData.category && courseData.category.trim() !== '') {
          categories.add(courseData.category);
        }
      } catch (e) {
        console.error('Error parsing course data:', e);
      }
    });
    
    return Array.from(categories).sort();
  } catch (error) {
    console.error('Error getting categories:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to load categories' });
  }
});
