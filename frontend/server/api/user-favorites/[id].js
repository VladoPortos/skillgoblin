import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import { loadProgressData, fetchCoursesByIds } from '../../utils/userCourseProgress';

// API endpoint to get ALL favorite courses for a user
// This endpoint bypasses regular pagination and returns the complete list.
// Auth: caller must be the user OR an admin.
export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.params.id;

    if (!userId) {
      return {
        success: false,
        error: 'User ID is required'
      };
    }

    requireSelfOrAdmin(event, userId);

    const db = getDb();

    // Fetch the user's progress to identify all favorites
    let progressData;
    try {
      progressData = loadProgressData(db, userId);
    } catch (e) {
      console.error('Error parsing progress data:', e);
      return {
        success: false,
        error: 'Invalid progress data format'
      };
    }

    // If user has no progress data, return empty array
    if (!progressData) {
      return {
        success: true,
        favorites: []
      };
    }

    // Extract favorite course IDs
    const favoriteCourseIds = [];
    for (const courseId in progressData) {
      if (progressData[courseId] && progressData[courseId].favorite) {
        favoriteCourseIds.push(courseId);
      }
    }

    // Fetch complete course data for all favorite courses
    const favoriteCourses = fetchCoursesByIds(db, favoriteCourseIds).map(c => c.data);

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
