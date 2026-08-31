import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import {
  loadProgressData,
  fetchCoursesByIds,
  summarizeCourseProgress
} from '../../utils/userCourseProgress';

// API endpoint to get ALL in-progress courses for a user
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

    // Fetch the user's progress data
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
        inProgress: []
      };
    }

    const inProgressCourses = fetchCoursesByIds(db, Object.keys(progressData))
      .map(course => {
        const summary = summarizeCourseProgress(course.data, progressData[course.id]);
        if (!summary.started || summary.complete) return null;
        return { ...course.data, progressPercentage: summary.percentage };
      })
      .filter(Boolean);

    return {
      success: true,
      inProgress: inProgressCourses
    };

  } catch (error) {
    if (error?.statusCode) throw error;
    console.error('Error in user-progress-courses API:', error);
    return {
      success: false,
      error: 'Failed to fetch in-progress courses'
    };
  }
});
