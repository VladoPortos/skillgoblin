import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';

// API endpoint to get ALL favorite courses for a user
// This endpoint bypasses regular pagination and returns the complete list
export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.params.id;
    
    if (!userId) {
      return { 
        success: false, 
        error: 'User ID is required'
      };
    }
    
    const db = getDb();
    
    // Fetch the user's progress to identify all favorites
    const userProgress = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
    
    // If user has no progress data, return empty array
    if (!userProgress || !userProgress.progress) {
      console.log(`No progress data found for user ${userId}`);
      return { 
        success: true, 
        favorites: [] 
      };
    }
    
    // Parse the progress data to get favorite course IDs
    let progressData;
    try {
      progressData = JSON.parse(userProgress.progress);
    } catch (e) {
      console.error(`Error parsing progress data for user ${userId}:`, e);
      return { 
        success: false, 
        error: 'Invalid progress data format'
      };
    }
    
    // Extract favorite course IDs
    const favoriteCourseIds = [];
    for (const courseId in progressData) {
      if (progressData[courseId] && progressData[courseId].favorite) {
        favoriteCourseIds.push(courseId);
      }
    }
    
    console.log(`Found ${favoriteCourseIds.length} favorite courses for user ${userId}`);
    
    // If no favorites, return empty array
    if (favoriteCourseIds.length === 0) {
      return { 
        success: true, 
        favorites: [] 
      };
    }
    
    // Fetch complete course data for all favorite courses
    const placeholders = favoriteCourseIds.map(() => '?').join(',');
    const favoriteCoursesStmt = db.prepare(`
      SELECT data FROM courses 
      WHERE id IN (${placeholders})
    `);
    
    const favoriteCoursesResult = favoriteCoursesStmt.all(favoriteCourseIds);
    
    // Parse course data JSON
    const favoriteCourses = favoriteCoursesResult.map(course => {
      try {
        return JSON.parse(course.data);
      } catch (e) {
        console.error(`Error parsing course data:`, e);
        return null;
      }
    }).filter(Boolean); // Remove any null entries from parsing errors
    
    console.log(`Successfully fetched ${favoriteCourses.length} favorite courses for user ${userId}`);
    
    return {
      success: true,
      favorites: favoriteCourses
    };
    
  } catch (error) {
    console.error('Error in user-favorites API:', error);
    return {
      success: false,
      error: 'Failed to fetch favorite courses'
    };
  }
});
