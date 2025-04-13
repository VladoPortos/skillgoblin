import path from 'path';

// Content directory path
export const getContentDir = () => path.resolve(process.cwd(), '/app/data/content');

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
