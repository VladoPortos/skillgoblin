import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import { loadProgressData, fetchCoursesByIds } from '../../utils/userCourseProgress';

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

    // Extract course IDs with progress > 0% but not complete
    const inProgressCourseIds = [];
    const progressPercentages = {};

    for (const courseId in progressData) {
      if (progressData[courseId] && progressData[courseId].completed) {
        let completedCount = 0;
        const completedMap = progressData[courseId].completed;
        for (const videoId in completedMap) {
          if (completedMap[videoId]) {
            completedCount++;
          }
        }

        if (completedCount > 0) {
          inProgressCourseIds.push(courseId);
          progressPercentages[courseId] = { completedVideos: completedCount };
        }
      }
    }

    // Fetch complete course data for all in-progress courses and compute
    // progress percentages
    const inProgressCourses = fetchCoursesByIds(db, inProgressCourseIds).map(course => {
      const courseData = course.data;

      // Calculate overall progress percentage using the total videos count
      if (progressPercentages[course.id]) {
        let totalVideos = 0;

        // Count all videos in the course
        courseData.lessons?.forEach(lesson => {
          if (lesson.videos) {
            totalVideos += lesson.videos.length;
          }
        });

        if (totalVideos > 0) {
          const completedVideos = progressPercentages[course.id].completedVideos;
          const progressPercent = Math.min(Math.round((completedVideos / totalVideos) * 100), 100);

          // Add progress percentage to course data for the frontend
          courseData.progressPercentage = progressPercent;
        }
      }

      return courseData;
    });

    return {
      success: true,
      inProgress: inProgressCourses
    };

  } catch (error) {
    console.error('Error in user-progress-courses API:', error);
    return {
      success: false,
      error: 'Failed to fetch in-progress courses'
    };
  }
});
