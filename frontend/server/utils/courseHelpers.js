import path from 'path';
import { createError } from 'h3';

// Content directory path
export const getContentDir = () => path.resolve(process.cwd(), '/app/data/content');

// Resolve a course folder name relative to the content directory and verify
// the result stays inside the content root. Throws on traversal attempts,
// empty/null input, or absolute paths. Used by every endpoint that turns a
// DB-stored folder_name into a real fs path.
export function resolveCourseDir(folderName) {
  if (!folderName || typeof folderName !== 'string' || folderName.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
  }
  const root = path.resolve(getContentDir());
  const candidate = path.resolve(root, folderName);
  // Add a trailing separator to root so /content/foo doesn't accidentally
  // pass when folderName resolves to /content/foobar — both startsWith.
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
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

// Resolve a file path, handling Docker volume mounts
export const resolveFilePath = (filePath) => {
  if (filePath.startsWith('..')) {
    // Handle relative path from Docker volume
    return path.resolve(process.cwd(), filePath);
  } else if (path.isAbsolute(filePath)) {
    // Already absolute path
    return filePath;
  } else {
    // Relative path to content dir
    return path.join(getContentDir(), filePath);
  }
};
