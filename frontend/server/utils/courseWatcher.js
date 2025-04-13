import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { getContentDir } from './courseHelpers';
import { generateCourseJson } from './courseGenerator';
import { saveCourseToDb, removeCourseFromDb, getCoursesWithDirectories } from './courseDatabase';
import { getDb } from './db';

// Status tracking for initial scan
export const initialScanStatus = {
  inProgress: false,
  complete: false,
  totalCourses: 0,
  processedCourses: 0,
  startTime: null,
  endTime: null,
  error: null,
  preserveMetadata: true
};

// Process new or changed course directories
const processCourseDirectory = async (courseDirPath, preserveMetadata = false) => {
  try {
    const courseDir = path.basename(courseDirPath);
    console.log(`Processing course directory: ${courseDir}`);
    
    // Only scan directory structure to get basic course info
    const courseData = generateCourseJson(courseDir, courseDirPath);
    
    if (courseData) {
      // Read thumbnail file directly into buffer
      const thumbnailBuffer = readThumbnailFile(courseDirPath, courseData.thumbnail);
      
      // Store in database with thumbnail
      const db = getDb();
      const existingCourse = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseData.id);
      
      if (existingCourse) {
        // Update existing course
        if (thumbnailBuffer && preserveMetadata) {
          // Update with thumbnail only if preserveMetadata is true
          db.prepare(`
            UPDATE courses 
            SET title = ?, description = ?, folder_name = ?, thumbnail = ?, 
                thumbnail_data = ?, category = ?, release_date = ?, data = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(
            courseData.title, 
            courseData.description, 
            courseDir,
            courseData.thumbnail,
            thumbnailBuffer,
            courseData.category,
            courseData.releaseDate,
            JSON.stringify(courseData),
            courseData.id
          );
        } else {
          // When not preserving metadata or no thumbnail found, clear thumbnail data
          db.prepare(`
            UPDATE courses 
            SET title = ?, description = ?, folder_name = ?, thumbnail = ?,
                thumbnail_data = NULL, category = ?, release_date = ?, data = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(
            courseData.title, 
            courseData.description, 
            courseDir,
            courseData.thumbnail,
            courseData.category,
            courseData.releaseDate,
            JSON.stringify(courseData),
            courseData.id
          );
        }
      } else {
        // Insert new course
        db.prepare(`
          INSERT INTO courses (
            id, title, description, folder_name, thumbnail, 
            thumbnail_data, category, release_date, data, 
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          courseData.id,
          courseData.title,
          courseData.description,
          courseDir,
          courseData.thumbnail,
          thumbnailBuffer,
          courseData.category,
          courseData.releaseDate,
          JSON.stringify(courseData)
        );
      }
      
      console.log(`Course data saved to database for ${courseDir}`);
      return { success: true, courseId: courseData.id };
    }
  } catch (error) {
    console.error(`Error processing course directory ${courseDirPath}:`, error);
  }
  return { success: false };
};

// Custom processing for preserving metadata
const processCourseDirWithMetadataPreservation = async (courseDirPath, existingCourses) => {
  try {
    const courseDir = path.basename(courseDirPath);
    console.log(`Processing course directory with metadata preservation: ${courseDir}`);
    
    // Only scan directory structure to get basic course info
    const courseData = generateCourseJson(courseDir, courseDirPath);
    
    if (!courseData) {
      console.warn(`Could not generate course data for ${courseDir}. Skipping.`);
      return { success: false };
    }

    // Get the database handle
    const db = getDb();
    
    // Check if course exists in our existing courses collection
    // This is a lookup by course ID which is derived from the directory path
    const existingCourse = db.prepare('SELECT id, title, description, category, release_date, data FROM courses WHERE id = ?').get(courseData.id);
    
    console.log(`Course ID: ${courseData.id}, Has existing data: ${!!existingCourse}`);
    
    let dataToSave = courseData;
    
    if (existingCourse) {
      console.log(`Preserving metadata for course: ${courseDir}`);
      
      // Merge existing course data with new course data
      // Keep core structure from new scan but preserve customizable fields
      dataToSave = {
        ...courseData, // Base structure from scan (id, content list, etc.)
        title: existingCourse.title || courseData.title,
        description: existingCourse.description || courseData.description,
        category: existingCourse.category || courseData.category,
        releaseDate: existingCourse.release_date || courseData.releaseDate,
        // Ensure thumbnail filename remains consistent if it existed
        thumbnail: existingCourse.thumbnail || courseData.thumbnail
      };
      
      console.log(`Prepared merged data for update: ${courseDir}`);
    } else {
      console.log(`No existing DB entry found for ${courseDir}, preparing for insert.`);
    }
    
    // Use the dedicated save function which handles insert/update and thumbnail_data correctly
    const result = saveCourseToDb(dataToSave, courseDir);
    
    if (result.success) {
      console.log(`Successfully processed (insert/update) course: ${courseDir}`);
      return { success: true, courseId: dataToSave.id };
    } else {
      console.error(`Failed to save course ${courseDir} via saveCourseToDb:`, result.error);
      return { success: false, error: result.error };
    }
    
  } catch (error) {
    console.error(`Error in processCourseDirWithMetadataPreservation for ${courseDirPath}:`, error);
    return { success: false, error: error.message }; 
  }
};

// Handle course directory removal
const handleCourseDirectoryRemoval = (dirPath) => {
  try {
    const courseDir = path.basename(dirPath);
    const contentDir = getContentDir();
    
    // Check if this is a course directory (parent should be content)
    if (path.dirname(dirPath) === contentDir) {
      console.log(`Course directory removed: ${courseDir}`);
      removeCourseFromDb(courseDir);
    }
  } catch (error) {
    console.error(`Error handling course directory removal: ${error.message}`);
  }
};

// Function to scan courses on startup
export const scanCoursesOnStartup = async (forceRescan = false, preserveMetadata = true) => {
  try {
    // If a scan is already in progress and this is not a force rescan, don't start another one
    if (initialScanStatus.inProgress && !forceRescan) {
      console.log('Scan already in progress, skipping duplicate scan request');
      return;
    }
    
    // Set initial scan status
    initialScanStatus.inProgress = true;
    initialScanStatus.complete = false;
    initialScanStatus.startTime = Date.now();
    initialScanStatus.processedCourses = 0;
    initialScanStatus.error = null;
    initialScanStatus.preserveMetadata = preserveMetadata;
    
    console.log(`Beginning course scan with preserveMetadata=${preserveMetadata}...`);
    const contentDir = getContentDir();
    const courseDirs = fs.readdirSync(contentDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => !dirent.name.startsWith('.')) // Ignore directories starting with a dot (like .Recycle.Bin)
      .map(dirent => dirent.name);
    
    initialScanStatus.totalCourses = courseDirs.length;
    console.log(`Found ${courseDirs.length} course directories`);
    
    // If preserving metadata, first fetch all existing courses with their current metadata
    let existingCourses = {};
    if (preserveMetadata) {
      try {
        const db = getDb();
        const courses = db.prepare('SELECT id, title, description, thumbnail, category, release_date FROM courses').all();
        existingCourses = courses.reduce((acc, course) => {
          acc[course.id] = course;
          return acc;
        }, {});
        console.log(`Loaded ${Object.keys(existingCourses).length} existing courses for metadata preservation`);
      } catch (error) {
        console.error('Error loading existing courses for metadata preservation:', error);
        // Continue with empty existingCourses if there was an error
      }
    }
    
    // Process each course directory
    for (const courseDir of courseDirs) {
      const courseDirPath = path.join(contentDir, courseDir);
      
      try {
        if (preserveMetadata) {
          // Custom processing for preserving metadata
          await processCourseDirWithMetadataPreservation(courseDirPath, existingCourses);
        } else {
          // Standard processing that resets metadata
          await processCourseDirectory(courseDirPath, false);
        }
        
        initialScanStatus.processedCourses++;
      } catch (error) {
        console.error(`Error processing course directory ${courseDir}:`, error);
      }
    }
    
    // Clean up courses that no longer exist in the filesystem
    await cleanupRemovedCourses(courseDirs);
    
    // Finalize scan status
    initialScanStatus.complete = true;
    initialScanStatus.inProgress = false;
    initialScanStatus.endTime = Date.now();
    const duration = (initialScanStatus.endTime - initialScanStatus.startTime) / 1000;
    console.log(`Course scan completed in ${duration.toFixed(2)} seconds. Processed ${initialScanStatus.processedCourses} of ${initialScanStatus.totalCourses} courses.`);
    
    return true;
  } catch (error) {
    console.error('Error during course scan:', error);
    initialScanStatus.error = error.message || 'Unknown error during scan';
    initialScanStatus.inProgress = false;
    initialScanStatus.complete = false;
    return false;
  }
};

// Function to clean up courses that no longer exist in the filesystem
const cleanupRemovedCourses = (existingCourseDirs) => {
  try {
    // Get all courses from the database with their directory names
    const coursesWithDirs = getCoursesWithDirectories();
    
    // Check each course in the database
    for (const course of coursesWithDirs) {
      if (!existingCourseDirs.includes(course.folder_name)) {
        console.log(`Removing deleted course from database: ${course.folder_name}`);
        removeCourseFromDb(course.folder_name);
      }
    }
  } catch (error) {
    console.error('Error during course cleanup:', error);
  }
};

// Set up file watching
export const setupFileWatcher = () => {
  try {
    const contentDir = getContentDir();
    console.log(`Setting up course watcher on: ${contentDir}`);
    
    // Only watch for directory additions and removals at the top level
    const watcher = chokidar.watch(contentDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      depth: 0, // Only watch top-level directories
      ignoreInitial: true
    });
    
    // Handle directory additions
    watcher.on('addDir', path => {
      // Only process top-level directories in the content folder
      if (path !== contentDir && path.split('/').length === contentDir.split('/').length + 1) {
        console.log(`New course directory detected: ${path}`);
        processCourseDirectory(path, false);
      }
    });
    
    // Handle directory removals
    watcher.on('unlinkDir', path => {
      if (path !== contentDir && path.split('/').length === contentDir.split('/').length + 1) {
        console.log(`Course directory removed: ${path}`);
        handleCourseDirectoryRemoval(path);
      }
    });
    
    // Handle errors
    watcher.on('error', error => {
      console.error('Course watcher error:', error);
    });
    
    console.log('Course watcher set up successfully');
    return watcher;
  } catch (error) {
    console.error('Error setting up course watcher:', error);
    return null;
  }
};

// Initial scan on startup
scanCoursesOnStartup();

// Start watching for changes
setupFileWatcher();
