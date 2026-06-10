import path from 'path';
import { createError } from 'h3';

// Content directory path
export const getContentDir = () => path.resolve(process.env.CONTENT_PATH || '/app/data/content');

// Video extensions surfaced as lessons. Each entry has been empirically
// verified to play in mainstream desktop browsers (Chrome/Edge) when served
// with a `video/mp4` content-type — see /api/content/[...path].js. The
// inner streams need to be browser-decodable (H.264 + AAC is the safe
// baseline); exotic codecs in any container will still fail playback.
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi']);

// Resolve a course folder name relative to the content directory and verify
// the result stays inside the content root. Throws on traversal attempts,
// empty/null input, or absolute paths. Used by every endpoint that turns a
// DB-stored folder_name into a real fs path.
export function resolveCourseDir(folderName) {
  if (!folderName || typeof folderName !== 'string' || folderName.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
  }
  // A course folder name is a single directory name. Reject anything that
  // looks like a path (separators) or starts with a dot (hidden dirs and
  // traversal anchors). Windows uses both '/' and '\\'.
  if (
    folderName === '.' ||
    folderName === '..' ||
    folderName.startsWith('.') ||
    folderName.includes('/') ||
    folderName.includes('\\') ||
    folderName.includes('\0')
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
  }
  const root = path.resolve(getContentDir());
  const candidate = path.resolve(root, folderName);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!candidate.startsWith(rootWithSep) || candidate === root) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
  }
  return candidate;
}

// Resolve a path inside a specific course's directory, rejecting any
// segment that escapes the course root. Used by the content endpoint
// after the course folder is identified, so URL path traversal in later
// segments cannot reach files outside the course directory.
export function resolvePathInCourse(courseDir, ...segments) {
  const root = path.resolve(courseDir);
  const candidate = path.resolve(root, ...segments);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }
  return candidate;
}

// Function to generate a course ID from a title
export const generateCourseId = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with a single one
};

 // Natural sort function for video/lesson sorting
export const naturalSort = (a, b, property = 'title') => {
  const aValue = a[property];
  const bValue = b[property];
  
  const aMatch = aValue.match(/^(\d+)/);
  const bMatch = bValue.match(/^(\d+)/);
  
  if (aMatch && bMatch) {
    return parseInt(aMatch[1]) - parseInt(bMatch[1]);
  }
  return aValue.localeCompare(bValue);
};

// Look up a course's folder_name by ID and resolve it to a directory on
// disk. Throws a 404 when the course (or its folder_name) is missing and
// propagates resolveCourseDir's 400 on invalid folder names.
export function resolveCourseById(db, courseId, { notFoundMessage = 'Course not found' } = {}) {
  const row = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
  if (!row || !row.folder_name) {
    throw createError({ statusCode: 404, statusMessage: notFoundMessage });
  }
  return { folderName: row.folder_name, courseDir: resolveCourseDir(row.folder_name) };
}
