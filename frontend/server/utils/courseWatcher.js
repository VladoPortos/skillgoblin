import fs from 'fs';
import { recordScanError } from './scanDiagnostics.js';
import path from 'path';
import chokidar from 'chokidar';
import { getContentDir, generateCourseId } from './courseHelpers';
import { generateCourseJson } from './courseGenerator';
import { saveCourseToDb, removeCourseFromDb, getCoursesWithDirectories } from './courseDatabase';
import { getDb } from './db';
import {
  readAndProcessThumbnail,
  getCourseRootPath,
  findLocalThumbnailPath,
  extractFrameThumbnail,
} from './thumbnailUtils';
import { readCourseJson, ALLOWED } from './courseJsonOverride.js';

// Read just the keys of course.json so we know which fields the operator
// pinned. Returns an empty Set on any read/parse failure so the caller treats
// the course as "no pinned fields."
function readCourseJsonKeys(courseDirPath) {
  const parsed = readCourseJson(courseDirPath);
  if (!parsed) return new Set();
  const pinned = new Set();
  for (const key of ALLOWED) {
    if (key in parsed && typeof parsed[key] === 'string') {
      pinned.add(key);
    }
  }
  return pinned;
}

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

export function topLevelCoursePath(contentDir, changedPath) {
  const root = path.resolve(contentDir);
  const candidate = path.resolve(changedPath);
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const firstSegment = relative.split(path.sep)[0];
  return firstSegment ? path.join(root, firstSegment) : null;
}

// Resolve the absolute path of a course's first video by walking the lesson
// tree the generator produced. Used by the frame-extract thumbnail fallback
// when neither a local asset nor a cached DB blob is available.
function resolveFirstVideoPath(courseRoot, courseData) {
  if (!courseRoot || !courseData?.lessons?.length) return null;
  for (const lesson of courseData.lessons) {
    const videos = lesson?.videos;
    if (!Array.isArray(videos) || videos.length === 0) continue;
    const file = videos[0]?.file;
    if (!file || typeof file !== 'string') continue;
    return path.join(courseRoot, lesson.folder || '', file);
  }
  return null;
}

// Function to synchronize thumbnail between filesystem and database.
// `courseData` is optional — passing it lets the function fall back to a
// frame-extract from the first video when no operator-supplied cover art
// exists. Callers that don't have courseData (e.g. a generic refresh path)
// just lose the frame-extract fallback, which degrades to "no thumbnail."
export async function synchronizeCourseThumbnail(courseId, courseFolderName, courseData = null) {
  if (!courseId || !courseFolderName) {
    console.error('synchronizeCourseThumbnail: courseId and courseFolderName are required.');
    return;
  }

  const db = getDb();
  const courseRoot = getCourseRootPath(courseFolderName);

  // Plex-style asset detection: thumbnail.* / cover.* / poster.* / folder.*
  // in priority order. Returning null means none exist on disk.
  const localThumbnailPath = findLocalThumbnailPath(courseRoot);

  try {
    const courseResult = db.prepare('SELECT thumbnail_data FROM courses WHERE id = ?').get(courseId);
    const dbThumbnailData = courseResult ? courseResult.thumbnail_data : null;

    // Read the local thumbnail by attempt rather than by existsSync-then-act.
    // ENOENT means it doesn't exist (a normal state, not an error); any other
    // failure propagates to the outer catch. This buffer-or-null pattern
    // eliminates the TOCTOU window between an upfront fs.existsSync sample
    // and the later read/write that CodeQL flagged twice (#30, #134).
    let localFileBuffer = null;
    if (localThumbnailPath) {
      try {
        localFileBuffer = fs.readFileSync(localThumbnailPath);
      } catch (readError) {
        if (readError.code !== 'ENOENT') throw readError;
      }
    }

    // Case 1: DB thumbnail_data is NULL and a local asset exists.
    if (!dbThumbnailData && localFileBuffer) {
      const processedLocalBuffer = await readAndProcessThumbnail(localThumbnailPath, localFileBuffer);
      if (processedLocalBuffer) {
        db.prepare('UPDATE courses SET thumbnail_data = ? WHERE id = ? AND thumbnail_data IS ?').run(processedLocalBuffer, courseId, dbThumbnailData);
      }
    }
    // Case 2: DB thumbnail_data is NULL and no local asset.
    // Try to derive one from the first video at the 10% mark. Frame-extract
    // failures (missing ffmpeg, corrupt video, ...) silently degrade to "no
    // thumbnail" — the UI's letter-fallback handles that branch already.
    else if (!dbThumbnailData && !localFileBuffer) {
      const firstVideoPath = resolveFirstVideoPath(courseRoot, courseData);
      if (firstVideoPath) {
        const frameBuffer = await extractFrameThumbnail(firstVideoPath);
        if (frameBuffer) {
          db.prepare('UPDATE courses SET thumbnail_data = ? WHERE id = ? AND thumbnail_data IS NULL').run(frameBuffer, courseId);
        }
      }
    }
    // Case 3: DB thumbnail_data is NOT NULL and no local asset.
    // Write the DB blob back to thumbnail.png so the operator sees a file in
    // the course folder. Uses the canonical name (thumbnail.png) so a
    // round-trip never overwrites a user-supplied cover.jpg / poster.png.
    else if (dbThumbnailData && !localFileBuffer) {
      const writeBackPath = path.join(courseRoot, 'thumbnail.png');
      try {
        // mkdirSync with recursive:true is idempotent — no exists-check needed.
        // Never recreate a removed or disconnected course directory.
        // 'wx' flag: atomic create-only-if-not-exists. EEXIST means a
        // concurrent process created the file between our read attempt
        // above and this write — their file is already a thumbnail, so
        // leave it.
        fs.writeFileSync(writeBackPath, dbThumbnailData, { flag: 'wx' });
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') {
          console.error(`[${courseId}] Error writing DB thumbnail to ${writeBackPath}:`, writeError);
        }
      }
    }
    // Case 4: DB thumbnail_data is NOT NULL and a local asset exists.
    // If the operator dropped one of the named cover-art conventions
    // (cover.jpg / poster.png / folder.jpg / ...), prefer it over whatever
    // is in the DB — that's the "I imported the course, then added a cover
    // later, rescanned, and expected it to win" flow. We only ever write
    // back to thumbnail.png ourselves, so a thumbnail.png on disk is the
    // round-tripped DB blob and stays under the existing edit-process-wins
    // semantics (admin uploads via the UI keep their precedence there).
    else if (dbThumbnailData && localFileBuffer) {
      const localName = path.basename(localThumbnailPath);
      // Case-sensitive comparison: the only filename we ever round-trip from
      // DB to disk is exactly `thumbnail.png`. Any other casing or basename
      // (`Thumbnail.png`, `cover.jpg`, `Poster.PNG`, ...) means an operator
      // dropped the file in by hand.
      const isOperatorAuthored = localName !== 'thumbnail.png';
      const differs = !localFileBuffer.equals(dbThumbnailData);
      if (isOperatorAuthored && differs) {
        const processedLocalBuffer = await readAndProcessThumbnail(localThumbnailPath, localFileBuffer);
        if (processedLocalBuffer) {
          db.prepare('UPDATE courses SET thumbnail_data = ? WHERE id = ? AND thumbnail_data IS ?').run(processedLocalBuffer, courseId, dbThumbnailData);
        }
      }
      // Otherwise: round-tripped thumbnail.png whose contents diverged from
      // the DB blob (e.g. admin-uploaded after the file was already on disk).
      // Keep DB-as-authority; the edit process is the source of truth.
    }
  } catch (error) {
    console.error(`Error synchronizing thumbnail for course ${courseId} (${courseFolderName}):`, error);
  }
}

// Process new or changed course directories without preserving metadata:
// any cached thumbnail blob is cleared so synchronizeCourseThumbnail
// re-derives it from disk (or a video frame).
const processCourseDirectory = async (courseDirPath) => {
  try {
    const courseDir = path.basename(courseDirPath);

    // Only scan directory structure to get basic course info
    const courseData = await generateCourseJson(courseDir, courseDirPath);
    if (!fs.statSync(courseDirPath).isDirectory()) throw new Error('Course path is not a directory');
    const existingByFolder = getDb()
      .prepare('SELECT id FROM courses WHERE folder_name = ?')
      .get(courseDir);
    if (courseData && existingByFolder?.id) courseData.id = existingByFolder.id;

    if (courseData) {
      const result = saveCourseToDb(courseData, courseDir);
      if (result.error) {
        recordScanError(courseDir, result.error);
        console.error(`Failed to save course ${courseDir} to database: ${result.error}`);
        return { success: false };
      }
      const db = getDb();
      db.prepare('UPDATE courses SET thumbnail_data = NULL WHERE id = ?').run(courseData.id);

      // After saving basic course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(courseData.id, courseDir, courseData);
      return { success: true, courseId: courseData.id };
    }
  } catch (error) {
    if (error.code === 'ENOENT' && !fs.existsSync(courseDirPath)) removeCourseFromDb(path.basename(courseDirPath));
    recordScanError(courseDirPath, error);
    console.error(`Error processing course directory ${courseDirPath}:`, error);
  }
  return { success: false };
};

// Custom processing for preserving metadata
const processCourseDirWithMetadataPreservation = async (courseDirPath) => {
  try {
    const courseDir = path.basename(courseDirPath);
    const courseId = generateCourseId(courseDir);

    const courseData = await generateCourseJson(courseDir, courseDirPath);
    if (!fs.statSync(courseDirPath).isDirectory()) throw new Error('Course path is not a directory');
    // Read after directory traversal: admin edits made during the await must survive.
    const existingCourseResult = getDb().prepare('SELECT * FROM courses WHERE folder_name = ? OR id = ? ORDER BY CASE WHEN folder_name = ? THEN 0 ELSE 1 END LIMIT 1').get(courseDir, courseId, courseDir);

    if (existingCourseResult && courseData) {
      courseData.id = existingCourseResult.id;
    }

    if (existingCourseResult && courseData) {
      // course.json (already applied inside generateCourseJson) is the source of
      // truth when present. DB-preserved metadata is the fallback for fields that
      // the operator did NOT pin in course.json.
      const jsonPinned = readCourseJsonKeys(courseDirPath);

      const updatedCourseData = {
        ...courseData,
        title: jsonPinned.has('title')
          ? courseData.title
          : (existingCourseResult.title ?? courseData.title),
        description: jsonPinned.has('description')
          ? courseData.description
          : (existingCourseResult.description ?? courseData.description),
        category: jsonPinned.has('category')
          ? courseData.category
          : (existingCourseResult.category ?? courseData.category),
        releaseDate: jsonPinned.has('releaseDate')
          ? courseData.releaseDate
          : (existingCourseResult.release_date ?? courseData.releaseDate),
      };

      // saveCourseToDb does not accept a third "preserveMetadata" arg —
      // its UPDATE statement already excludes thumbnail_data so existing
      // blob data survives unchanged. synchronizeCourseThumbnail handles
      // the actual data sync afterwards.
      const result = saveCourseToDb(updatedCourseData, courseDir);
      if (result.error) {
        recordScanError(courseDir, result.error);
        console.error(`Failed to save course ${courseDir} to database: ${result.error}`);
        return;
      }
      // After saving/updating course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(updatedCourseData.id, courseDir, updatedCourseData);

    } else if (courseData) {
      // New course or no existing metadata to preserve, treat as new
      // saveCourseToDb's INSERT branch sets thumbnail_data to NULL initially.
      const result = saveCourseToDb(courseData, courseDir);
      if (result.error) {
        recordScanError(courseDir, result.error);
        console.error(`Failed to save course ${courseDir} to database: ${result.error}`);
        return;
      }
      // After saving basic course data, synchronize the thumbnail
      await synchronizeCourseThumbnail(courseData.id, courseDir, courseData);
    } else {
      console.warn(`Could not generate course data for ${courseDir} during metadata preservation.`);
    }
  } catch (error) {
    if (error.code === 'ENOENT' && !fs.existsSync(courseDirPath)) removeCourseFromDb(path.basename(courseDirPath));
    recordScanError(courseDirPath, error);
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
const runFullScan = async (forceRescan = false, preserveMetadata = true) => {
  try {
    // Set initial scan status for a full scan
    initialScanStatus.inProgress = true;
    initialScanStatus.complete = false;
    initialScanStatus.startTime = Date.now();
    initialScanStatus.processedCourses = 0;
    initialScanStatus.error = null;
    initialScanStatus.preserveMetadata = preserveMetadata;
    
    console.log(`Beginning course scan of ${getContentDir()} with preserveMetadata=${preserveMetadata}...`);
    const contentDir = getContentDir();
    const courseDirs = fs.readdirSync(contentDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .filter(dirent => !dirent.name.startsWith('.')) // Ignore directories starting with a dot (like .Recycle.Bin)
      .map(dirent => dirent.name);

    initialScanStatus.totalCourses = courseDirs.length;

    for (const courseDir of courseDirs) {
      if (stopping) return false;
      const courseDirPath = path.join(contentDir, courseDir);
      try {
        if (preserveMetadata) {
          // Custom processing for preserving metadata, passing the array
          await processCourseDirWithMetadataPreservation(courseDirPath);
        } else {
          // Standard processing that resets metadata
          await processCourseDirectory(courseDirPath);
        }
        
        initialScanStatus.processedCourses++;
      } catch (error) {
        console.error(`Error processing course directory ${courseDir}:`, error);
      }
    }
    
    if (stopping) return false;
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
    recordScanError('(library)', error);
    if (error.code === 'ENOENT') getDb().prepare('UPDATE courses SET available = 0').run();
    initialScanStatus.error = error.message || 'Unknown error during scan';
    initialScanStatus.inProgress = false;
    initialScanStatus.complete = false;
    return false;
  }
};


// Missing folders are recoverable. Never delete their metadata or progress.
const cleanupRemovedCourses = (existingCourseDirs) => {
  const present = new Set(existingCourseDirs);
  for (const course of getCoursesWithDirectories()) {
    if (!present.has(course.folder_name)) removeCourseFromDb(course.folder_name);
  }
};

let queue = Promise.resolve();
let fullScan = null;
let stopping = false;
const pendingAddDirTimers = new Map();
const pendingCourses = new Set();
const watchers = new Set();
function enqueue(work) {
  const result = queue.then(() => stopping ? undefined : work());
  queue = result.catch(error => recordScanError('(queue)', error));
  return result;
}
export const scanCoursesOnStartup = (forceRescan = false, preserveMetadata = true) => {
  if (fullScan) return fullScan;
  if (stopping) return Promise.resolve(false);
  initialScanStatus.inProgress = true;
  initialScanStatus.complete = false;
  initialScanStatus.error = null;
  fullScan = enqueue(() => runFullScan(forceRescan, preserveMetadata)).finally(() => { fullScan = null; initialScanStatus.inProgress = false; });
  return fullScan;
};

export const setupFileWatcher = (pollingInterval = 60000) => {
  stopping = false;
  const contentDir = getContentDir();
  const watcher = chokidar.watch(contentDir, {
    ignored: /(^|[/\\])\../, persistent: true, ignoreInitial: true,
    usePolling: true, interval: pollingInterval
  });
  watchers.add(watcher);
  const scheduleRescan = changedPath => {
    if (stopping) return;
    const coursePath = topLevelCoursePath(contentDir, changedPath);
    if (!coursePath) return;
    clearTimeout(pendingAddDirTimers.get(coursePath));
    pendingAddDirTimers.set(coursePath, setTimeout(() => {
      pendingAddDirTimers.delete(coursePath);
      if (pendingCourses.has(coursePath)) return;
      pendingCourses.add(coursePath);
      enqueue(async () => {
        // Remove before processing so a change during the await queues another pass.
        pendingCourses.delete(coursePath);
        try {
          const stat = await fs.promises.stat(coursePath);
          if (stat.isDirectory()) await processCourseDirWithMetadataPreservation(coursePath);
        } catch (error) {
          if (error.code === 'ENOENT') handleCourseDirectoryRemoval(coursePath);
          else recordScanError(coursePath, error);
        }
      });
    }, 2000));
  };
  for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir']) watcher.on(event, scheduleRescan);
  watcher.on('error', error => recordScanError('(watcher)', error));
  return watcher;
};
export async function closeCourseWatchers() {
  stopping = true;
  for (const timer of pendingAddDirTimers.values()) clearTimeout(timer);
  pendingAddDirTimers.clear();
  pendingCourses.clear();
  await Promise.all([...watchers].map(watcher => watcher.close()));
  watchers.clear();
  await queue;
}
