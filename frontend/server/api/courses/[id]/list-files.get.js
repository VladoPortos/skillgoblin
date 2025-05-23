import { scanCourseFiles } from '../../../utils/fileScanner'; // Adjusted path

export default defineEventHandler(async (event) => {
  const courseId = event.context.params.id;

  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }
  
  try {
    const { courseTitle, filesByFolder } = await scanCourseFiles(courseId);
    return {
      success: true,
      courseTitle: courseTitle,
      filesByFolder: filesByFolder,
    };
  } catch (error) {
    console.error(`Error scanning files for course ${courseId}:`, error);
    // Check if the error is due to course folder not found to return a 404
    if (error.message.includes('Course folder not found')) {
      throw createError({ statusCode: 404, statusMessage: 'Course not found or course folder missing.' });
    }
    throw createError({ statusCode: 500, statusMessage: error.message || 'Failed to list course files.' });
  }
});
