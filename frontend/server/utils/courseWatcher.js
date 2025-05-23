import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { getContentDir } from './courseHelpers';
import { generateCourseJson } from './courseGenerator';
import { saveCourseToDb, removeCourseFromDb, getCoursesWithDirectories, getCourseCountFromDb } from './courseDatabase';
import { getDb } from './db';
import { readAndProcessThumbnail, getCourseRootPath } from './thumbnailUtils';
import { generateCourseId } from './courseHelpers'; // Added generateCourseId import explicitly for clarity within processCourseDirWithMetadataPreservation

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

// Function to synchronize thumbnail between filesystem and database
async function synchronizeCourseThumbnail(courseId, courseFolderName) {
  if (!courseId || !courseFolderName) {
    console.error('synchronizeCourseThumbnail: courseId and courseFolderName are required.');
    return;
  }

  const db = getDb();
  const courseRoot = getCourseRootPath(courseFolderName);
  const localThumbnailPath = path.join(courseRoot, 'thumbnail.png');
  const localThumbnailExists = fs.existsSync(localThumbnailPath);

  try {
    const courseResult = db.prepare('SELECT thumbnail_data FROM courses WHERE id = ?').get(courseId);
    const dbThumbnailData = courseResult ? courseResult.thumbnail_data : null;

    // Case 1: DB thumbnail_data is NULL and thumbnail.png exists locally.
    if (!dbThumbnailData && localThumbnailExists) {
      console.log(`[${courseId}] DB thumb is NULL, local exists. Updating DB from local file.`);
      const processedLocalBuffer = await readAndProcessThumbnail(localThumbnailPath);
      if (processedLocalBuffer) {
        db.prepare('UPDATE courses SET thumbnail_data = ? WHERE id = ?').run(processedLocalBuffer, courseId);
        console.log(`[${courseId}] DB thumbnail_data updated from local ${localThumbnailPath}`);
      }
    } 
    // Case 2: DB thumbnail_data is NULL and thumbnail.png does NOT exist locally.
    else if (!dbThumbnailData && !localThumbnailExists) {
      // console.log(`[${courseId}] DB thumb is NULL, local does not exist. Doing nothing.`);
    } 
    // Case 3: DB thumbnail_data is NOT NULL and thumbnail.png does NOT exist locally.
    else if (dbThumbnailData && !localThumbnailExists) {
      console.log(`[${courseId}] DB thumb exists, local does not. Writing DB thumb to local file.`);
      try {
        if (!fs.existsSync(courseRoot)) {
          fs.mkdirSync(courseRoot, { recursive: true });
        }
        fs.writeFileSync(localThumbnailPath, dbThumbnailData); // Just write it
        console.log(`[${courseId}] Local thumbnail.png created from DB data at ${localThumbnailPath}`);
      } catch (writeError) {
        console.error(`[${courseId}] Error writing DB thumbnail to ${localThumbnailPath}:`, writeError);
      }
    } 
    // Case 4: DB thumbnail_data is NOT NULL and thumbnail.png exists locally.
    else if (dbThumbnailData && localThumbnailExists) {
      const localFileBuffer = fs.readFileSync(localThumbnailPath); // Read the raw local file
      // We compare raw buffers here. Processing is for new uploads or when local is source.
      if (!localFileBuffer.equals(dbThumbnailData)) {
        // Log the difference but do not automatically overwrite.
        // The edit process handles ensuring consistency after an intentional change.
        console.log(`[${courseId}] DB thumbnail and local thumbnail differ. The application will use the DB version for display. The local file will not be automatically changed by this scan operation.`);
      } else {
        // console.log(`[${courseId}] DB thumbnail and local thumbnail are in sync.`);
      }
    }
  } catch (error) {
    console.error(`Error synchronizing thumbnail for course ${courseId} (${courseFolderName}):`, error);
  }
}

// Process new or changed course directories
const processCourseDirectory = async (courseDirPath, preserveMetadata = false) => {
  try {
    const courseDir = path.basename(courseDirPath);
    console.log(`Processing course directory: ${courseDir}`);
    
    // Only scan directory structure to get basic course info
    const courseData = generateCourseJson(courseDir, courseDirPath);
    
    if (courseData) {
      // Thumbnail reading removed, handled elsewhere.
      // const thumbnailBuffer = readThumbnailFile(courseDirPath, courseData.thumbnail);
      
      // Store in database
      const db = getDb();
      const existingCourse = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseData.id);
      
      if (existingCourse) {
        // Update existing course
        if (preserveMetadata) { // Simplified condition - thumbnailBuffer check removed
          // Update existing course, keeping existing thumbnail_data if preserveMetadata is true
          // Note: thumbnail_data is NOT updated here anymore.
          db.prepare(`
            UPDATE courses 
            SET title = ?, description = ?, folder_name = ?, thumbnail = ?, 
                category = ?, release_date = ?, data = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(
            courseData.title, 
            courseData.description, 
            courseDir,
            courseData.thumbnail,
            // thumbnailBuffer, // Removed
            courseData.category,
            courseData.releaseDate,
            JSON.stringify(courseData),
            courseData.id
          );
        } else {
          // When not preserving metadata, clear thumbnail data
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
        // Insert new course, setting thumbnail_data to NULL initially
        db.prepare(`
          INSERT INTO courses (
            id, title, description, folder_name, thumbnail, 
            thumbnail_data, category, release_date, data, 
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          courseData.id,
          courseData.title,
          courseData.description,
          courseDir,
          courseData.thumbnail,
          // thumbnailBuffer, // Removed
          courseData.category,
          courseData.releaseDate,
          JSON.stringify(courseData)
        );
      }
      
      console.log(`Course data saved to database for ${courseDir}`);
      // After saving basic course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(courseData.id, courseDir);
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
    const courseId = generateCourseId(courseDir); // Use generateCourseId from courseHelpers
    console.log(`Processing course directory with metadata preservation: ${courseDir}`);
    // The following debug line can be removed once confirmed working
    // console.log('[Debug] existingCourses type:', typeof existingCourses, 'Is Array:', Array.isArray(existingCourses));

    const existingCourseResult = existingCourses.find(c => c.id === courseId);
    const courseData = generateCourseJson(courseDir, courseDirPath);

    if (existingCourseResult && courseData) {
      const updatedCourseData = {
        ...courseData, // Start with new data from filesystem
        title: existingCourseResult.title || courseData.title,
        description: existingCourseResult.description || courseData.description,
        category: existingCourseResult.category || courseData.category,
        releaseDate: existingCourseResult.release_date || courseData.releaseDate,
        // thumbnail: existingCourseResult.thumbnail || courseData.thumbnail, // Keep existing thumbnail filename, handled by generateCourseJson
        // lessons will be from new scan via courseData.lessons
      };

      // Use saveCourseToDb which handles metadata updates carefully
      // The `true` for preserveMetadata in saveCourseToDb is about not nullifying thumbnail_data if it exists.
      // synchronizeCourseThumbnail will handle the actual data sync afterwards.
      await saveCourseToDb(updatedCourseData, courseDir, true); 
      console.log(`Course metadata updated (preserved) for ${courseDir}`);
      // After saving/updating course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(updatedCourseData.id, courseDir);

    } else if (courseData) {
      // New course or no existing metadata to preserve, treat as new
      // saveCourseToDb will handle insert, setting thumbnail_data to NULL initially if preserveMetadata is false.
      await saveCourseToDb(courseData, courseDir, false);
      console.log(`New course data saved (or no metadata to preserve) for ${courseDir}`);
      // After saving basic course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(courseData.id, courseDir);
    } else {
      console.warn(`Could not generate course data for ${courseDir} during metadata preservation.`);
    }
  } catch (error) {
    console.error(`Error in processCourseDirWithMetadataPreservation for ${courseDirPath}:`, error);
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

    // --- BEGIN MODIFICATION: Skip scan if DB is populated and not a forced rescan ---
    if (!forceRescan) {
      const courseCount = getCourseCountFromDb();
      if (courseCount > 0) {
        console.log(`Initial scan skipped; database already populated with ${courseCount} courses.`);
        // Update initialScanStatus to reflect a completed (skipped) scan
        initialScanStatus.inProgress = false;
        initialScanStatus.complete = true;
        initialScanStatus.startTime = initialScanStatus.startTime || Date.now(); // Keep existing start time if scan was previously attempted
        initialScanStatus.endTime = Date.now();
        initialScanStatus.totalCourses = courseCount;
        initialScanStatus.processedCourses = courseCount; // All existing courses are considered 'processed'
        initialScanStatus.error = null;
        // initialScanStatus.preserveMetadata is not explicitly set here as it's a parameter for an active scan.
        // Its existing value in initialScanStatus will persist, which is fine.
        return true; // Indicate successful (skipped) scan
      }
    }
    // --- END MODIFICATION ---

    // Set initial scan status for a full scan
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
    console.log(`Found ${initialScanStatus.totalCourses} course directories to scan.`);

    // Fetch existing courses from DB if preserving metadata
    let existingCourses = []; // Initialize as an empty array
    if (preserveMetadata) {
      try {
        const db = getDb();
        // This should fetch all relevant fields for comparison, as an array
        existingCourses = db.prepare('SELECT id, title, description, category, release_date, folder_name, thumbnail_data FROM courses').all();
        console.log(`[Debug DB Query] Raw queryResult type: ${typeof existingCourses}, Is Array: ${Array.isArray(existingCourses)}`);
        console.log(`Fetched ${existingCourses.length} existing courses from DB for metadata preservation.`);
      } catch (dbError) {
        console.error('Error fetching existing courses from DB:', dbError);
        // Continue with an empty existingCourses array if DB fetch fails, 
        // effectively treating all courses as new for this scan pass.
        existingCourses = []; 
      }
    }

    for (const courseDir of courseDirs) {
      const courseDirPath = path.join(contentDir, courseDir);
      try {
        if (preserveMetadata) {
          // Custom processing for preserving metadata, passing the array
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

    // Read interval from environment variable or use default (60 seconds)
    const pollingInterval = parseInt(process.env.CHOKIDAR_POLLING_INTERVAL || '60000', 10);

    // Only watch for directory additions and removals at the top level
    const watcher = chokidar.watch(contentDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      depth: 0, // Only watch top-level directories
      ignoreInitial: true,
      usePolling: true, // Enable polling for reliability in Docker
      interval: pollingInterval // Use configured interval
    });
    
    // Handle directory additions
    watcher.on('addDir', async path => {
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

// Start watching for changes only if polling interval is > 0
const pollingIntervalEnv = process.env.CHOKIDAR_POLLING_INTERVAL;
const pollingInterval = parseInt(pollingIntervalEnv || '60000', 10); // Default 60s if not set

if (pollingInterval > 0) {
  setupFileWatcher();
} else {
  console.log('CHOKIDAR_POLLING_INTERVAL is set to 0. File watcher disabled.');
}
