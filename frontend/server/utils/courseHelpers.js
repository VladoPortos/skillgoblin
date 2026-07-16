import fs from 'fs';
import path from 'path';
import { createError } from 'h3';

// Content directory path
export const getContentDir = () => path.resolve(
  process.env.CONTENT_DIR || process.env.CONTENT_PATH || '/app/data/content'
);

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

// Lexical containment (resolvePathInCourse) proves only that the *pathname*
// sits under the course root; a symlink component can still point outside.
// This re-checks an already-resolved path AFTER symlink resolution, right
// before a read, so a course containing e.g. `jump -> /etc` can't exfiltrate
// files outside the content tree.
//
// Returns the real path on success, null if the path doesn't exist (callers do
// their own existence check), and throws 400 on an out-of-root escape.
export function assertResolvedInside(root, candidatePath) {
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(root));
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }
  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidatePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }
  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (realCandidate !== realRoot && !realCandidate.startsWith(rootWithSep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }
  return realCandidate;
}

// Write a file without following a symlink at the destination. If an attacker
// (or a malicious course bundle) planted `course.json -> /app/data/database/
// database.sqlite`, a plain writeFileSync would follow the link and truncate
// the DB. We write a fresh temp file with O_EXCL ('wx', so we never write
// THROUGH a planted link) and atomically rename it over the target — rename
// replaces the directory entry itself, swapping out any symlink rather than
// following it.
export function writeFileNoFollow(targetPath, data) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  try {
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* best effort */ }
    throw err;
  }
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
