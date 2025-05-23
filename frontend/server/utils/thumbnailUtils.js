import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getContentDir } from './courseHelpers';

/**
 * Get the absolute path to a course's root directory.
 * @param {string} courseFolderName - The name of the course folder.
 * @returns {string} Absolute path to the course's root directory.
 */
export const getCourseRootPath = (courseFolderName) => {
  if (!courseFolderName) {
    console.error('getCourseRootPath: courseFolderName is required');
    // Potentially throw an error or return a clearly invalid path
    return path.join(getContentDir(), 'INVALID_COURSE_FOLDER'); 
  }
  return path.join(getContentDir(), courseFolderName);
};

/**
 * Reads a thumbnail image file, processes it with sharp, and returns a buffer.
 * @param {string} thumbnailPath - Absolute path to the thumbnail.png file.
 * @returns {Promise<Buffer|null>} Processed image buffer or null if an error occurs.
 */
export const readAndProcessThumbnail = async (thumbnailPath) => {
  try {
    if (!fs.existsSync(thumbnailPath)) {
      // console.log(`Thumbnail not found at: ${thumbnailPath}`);
      return null;
    }
    const fileBuffer = fs.readFileSync(thumbnailPath);
    const processedBuffer = await sharp(fileBuffer)
      .resize(480, 270, {
        fit: 'cover',
        position: 'center',
      })
      .toBuffer();
    return processedBuffer;
  } catch (error) {
    console.error(`Error processing thumbnail at ${thumbnailPath}:`, error);
    return null;
  }
};
