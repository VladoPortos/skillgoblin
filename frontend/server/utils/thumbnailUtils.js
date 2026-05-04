import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { resolveCourseDir } from './courseHelpers';

/**
 * Get the absolute path to a course's root directory.
 * Returns null if the folder name is invalid (empty, contains separators,
 * or attempts traversal). Callers should check for null and skip filesystem
 * writes gracefully rather than crash.
 * @param {string} courseFolderName - The name of the course folder.
 * @returns {string|null} Absolute path to the course's root directory, or null on invalid input.
 */
export const getCourseRootPath = (courseFolderName) => {
  try {
    return resolveCourseDir(courseFolderName);
  } catch {
    return null;
  }
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
