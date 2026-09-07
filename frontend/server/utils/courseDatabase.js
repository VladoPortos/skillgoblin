import { getDb } from './db';

// Function to save course data to the database (called during scan/generation)
// This should only update metadata, not thumbnail blob data.
export const saveCourseToDb = (courseData, folderName, dbInstance = null) => {
  try {
    const db = dbInstance || getDb();

    const videoIds = (courseData.lessons || []).flatMap(l => (l.videos || []).map((v, i) => v.id || `${l.id}-${i}`));

    // Check if course already exists in database
    const existingCourse = db.prepare('SELECT id, folder_name FROM courses WHERE id = ?').get(courseData.id);

    if (existingCourse && existingCourse.folder_name !== folderName) {
      return {
        error: `Course ID collision: "${folderName}" and "${existingCourse.folder_name}" both map to "${courseData.id}"`
      };
    }

    if (existingCourse) {
      // Update existing course metadata (DO NOT TOUCH thumbnail_data here)
      // Update metadata only, excluding thumbnail_data
      db.prepare(`
        UPDATE courses 
        SET title = ?, description = ?, folder_name = ?, thumbnail = ?, 
            category = ?, release_date = ?, data = ?, available = 1, video_count = ?, video_ids = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        courseData.title, 
        courseData.description, 
        folderName,
        courseData.thumbnail, // Keep standard thumbnail filename
        courseData.category,
        courseData.releaseDate,
        JSON.stringify(courseData),
        videoIds.length, JSON.stringify(videoIds),
        courseData.id
      );

    } else {
      // Insert new course metadata (set thumbnail_data to NULL initially)
      db.prepare(`
        INSERT INTO courses (id, title, description, folder_name, thumbnail, 
                            thumbnail_data, category, release_date, data, 
                            created_at, updated_at, video_count, video_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `).run(
        courseData.id,
        courseData.title,
        courseData.description,
        folderName,
        courseData.thumbnail, // Keep standard thumbnail filename
        null, // Set thumbnail_data to NULL on initial insert
        courseData.category,
        courseData.releaseDate,
        JSON.stringify(courseData), videoIds.length, JSON.stringify(videoIds)
      );
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving course to database:', error);
    return { error: 'Failed to save course' };
  }
};

// Get all courses including created_at, with a sort param.
// Accepts an explicit `db` for unit testing; defaults to the singleton.
export const getAllCoursesWithMeta = (dbInstance = null, opts = {}) => {
  const db = dbInstance || getDb();
  const sort = opts.sort === 'newest' ? 'created_at DESC, id ASC' : 'title ASC';
  try {
    const rows = db
      .prepare(`SELECT data, created_at FROM courses ORDER BY ${sort}`)
      .all();
    return rows.map((r) => {
      const parsed = JSON.parse(r.data);
      return { ...parsed, created_at: r.created_at };
    });
  } catch (err) {
    console.error('Error retrieving courses with meta:', err);
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

// Function to remove a course from the database by folder name
export const removeCourseFromDb = (folderName) => {
  getDb().prepare('UPDATE courses SET available = 0 WHERE folder_name = ?').run(folderName);
  return { success: true };
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

// Function to get a count of courses in the database
export const getCourseCountFromDb = () => {
  try {
    const db = getDb();
    // Prepare a statement to count all entries in the 'courses' table.
    // 'AS count' renames the result of COUNT(*) to 'count' for easier access.
    const result = db.prepare('SELECT COUNT(*) as count FROM courses').get();
    // If the query was successful and 'result' is not null, return the count.
    // Otherwise, return 0, indicating no courses or an issue with the query.
    return result ? result.count : 0;
  } catch (error) {
    // Log any errors encountered during the database operation.
    console.error('Error retrieving course count from database:', error);
    // Return 0 in case of an error. This allows the calling function (e.g., scanCoursesOnStartup)
    // to decide how to proceed, potentially by initiating a full scan if the DB state is uncertain.
    return 0;
  }
};
