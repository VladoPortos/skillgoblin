import { getDb } from './db';

// Function to save course data to the database (called during scan/generation)
// This should only update metadata, not thumbnail blob data.
export const saveCourseToDb = (courseData, folderName) => {
  try {
    console.log(`Scanning/Saving course metadata to DB: ${folderName} with category: ${courseData.category}`);
    const db = getDb();
    
    // Check if course already exists in database
    const existingCourse = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseData.id); // Only need ID to check existence
    
    if (existingCourse) {
      // Update existing course metadata (DO NOT TOUCH thumbnail_data here)
      console.log(`Updating existing course metadata: ${courseData.id}`);
      
      // Update metadata only, excluding thumbnail_data
      db.prepare(`
        UPDATE courses 
        SET title = ?, description = ?, folder_name = ?, thumbnail = ?, 
            category = ?, release_date = ?, data = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(
        courseData.title, 
        courseData.description, 
        folderName,
        courseData.thumbnail, // Keep standard thumbnail filename
        courseData.category,
        courseData.releaseDate,
        JSON.stringify(courseData),
        courseData.id
      );

    } else {
      // Insert new course metadata (set thumbnail_data to NULL initially)
      console.log(`Inserting new course metadata: ${courseData.id}`);
      db.prepare(`
        INSERT INTO courses (id, title, description, folder_name, thumbnail, 
                            thumbnail_data, category, release_date, data, 
                            created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        courseData.id,
        courseData.title,
        courseData.description,
        folderName,
        courseData.thumbnail, // Keep standard thumbnail filename
        null, // Set thumbnail_data to NULL on initial insert
        courseData.category,
        courseData.releaseDate,
        JSON.stringify(courseData)
      );
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving course to database:', error);
    return { error: 'Failed to save course' };
  }
};

// Function to get all courses from database
export const getAllCoursesFromDb = () => {
  try {
    const db = getDb();
    const dbCourses = db.prepare('SELECT data FROM courses ORDER BY title').all();
    return dbCourses.map(course => JSON.parse(course.data));
  } catch (error) {
    console.error('Error retrieving courses from database:', error);
    return [];
  }
};

// Function to get a single course from database by ID
export const getCourseFromDb = (courseId) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT data FROM courses WHERE id = ?').get(courseId);
    return course ? JSON.parse(course.data) : null;
  } catch (error) {
    console.error(`Error retrieving course ${courseId} from database:`, error);
    return null;
  }
};

// Function to get course folder name by ID
export const getCourseFolderNameById = (courseId) => {
  try {
    const db = getDb();
    const course = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
    return course ? course.folder_name : null;
  } catch (error) {
    console.error(`Error retrieving folder name for course ${courseId}:`, error);
    return null;
  }
};

// Function to remove a course from the database by folder name
export const removeCourseFromDb = (folderName) => {
  try {
    const db = getDb();
    console.log(`Removing course from database: ${folderName}`);
    
    // First get the course ID to ensure we have the right record
    const course = db.prepare('SELECT id FROM courses WHERE folder_name = ?').get(folderName);
    
    if (course) {
      console.log(`Found course with ID ${course.id}, removing...`);
      
      // Remove the course
      db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
      
      // Also clean up any user progress for this course
      try {
        db.prepare('UPDATE user_progress SET progress = json_remove(progress, ?) WHERE json_extract(progress, ?) IS NOT NULL')
          .run(`$.${course.id}`, `$.${course.id}`);
        console.log(`Removed course ${course.id} from user progress records`);
      } catch (progressError) {
        console.error(`Error removing course ${course.id} from user progress:`, progressError);
      }
      
      return { success: true, message: `Course ${folderName} removed from database` };
    } else {
      console.log(`No course found with folder name ${folderName}`);
      return { success: false, message: 'Course not found in database' };
    }
  } catch (error) {
    console.error(`Error removing course ${folderName} from database:`, error);
    return { error: 'Failed to remove course' };
  }
};

// Function to get all courses with their directory information
export const getCoursesWithDirectories = () => {
  try {
    const db = getDb();
    const courses = db.prepare('SELECT id, folder_name FROM courses').all();
    return courses;
  } catch (error) {
    console.error('Error retrieving courses with directories:', error);
    return [];
  }
};
