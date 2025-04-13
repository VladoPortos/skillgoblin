import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';

// API endpoint to get ALL in-progress courses for a user
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
    
    // Fetch the user's progress data
    const userProgress = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
    
    // If user has no progress data, return empty array
    if (!userProgress || !userProgress.progress) {
      console.log(`No progress data found for user ${userId}`);
      return { 
        success: true, 
        inProgress: [] 
      };
    }
    
    // Parse the progress data
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
    
    // Extract course IDs with progress > 0% but not complete
    const inProgressCourseIds = [];
    const progressPercentages = {};
    
    for (const courseId in progressData) {
      if (progressData[courseId]) {
        // Check if there are any completed videos
        let hasProgress = false;
        if (progressData[courseId].completed) {
          const completedMap = progressData[courseId].completed;
          for (const videoId in completedMap) {
            if (completedMap[videoId]) {
              hasProgress = true;
              break;
            }
          }
        }
        
        if (hasProgress) {
          inProgressCourseIds.push(courseId);
          
          // Store the completed video count for later progress calculation
          if (progressData[courseId].completed) {
            let completedCount = 0;
            const completedMap = progressData[courseId].completed;
            for (const videoId in completedMap) {
              if (completedMap[videoId]) {
                completedCount++;
              }
            }
            progressPercentages[courseId] = { completedVideos: completedCount };
          }
        }
      }
    }
    
    console.log(`Found ${inProgressCourseIds.length} in-progress courses for user ${userId}`);
    
    // If no in-progress courses, return empty array
    if (inProgressCourseIds.length === 0) {
      return { 
        success: true, 
        inProgress: [] 
      };
    }
    
    // Fetch complete course data for all in-progress courses
    const placeholders = inProgressCourseIds.map(() => '?').join(',');
    const inProgressCoursesStmt = db.prepare(`
      SELECT id, data FROM courses 
      WHERE id IN (${placeholders})
    `);
    
    const inProgressCoursesResult = inProgressCoursesStmt.all(inProgressCourseIds);
    
    // Parse course data JSON and compute progress percentages
    const inProgressCourses = inProgressCoursesResult.map(course => {
      try {
        const courseData = JSON.parse(course.data);
        
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
      } catch (e) {
        console.error(`Error parsing course data:`, e);
        return null;
      }
    }).filter(Boolean); // Remove any null entries from parsing errors
    
    console.log(`Successfully fetched ${inProgressCourses.length} in-progress courses for user ${userId}`);
    
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
