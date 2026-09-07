import { getDb } from '../../utils/db';
import { parseCourseMultipart } from '../../utils/courseMultipart.js';
import fs from 'fs';
import path from 'path';
import { createError, defineEventHandler } from 'h3';
import { getCourseRootPath, processThumbnailBuffer } from '../../utils/thumbnailUtils';
import { writeFileNoFollow } from '../../utils/courseHelpers';
import { requireAdmin } from '../../utils/authz';



export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const db = getDb();

  try {
    const { fields, files } = await parseCourseMultipart(event.node.req);

    // Parse the course data from JSON
    const formCourseData = JSON.parse(fields.course);

    if (files.thumbnail?.truncated) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Thumbnail exceeds the 10MB upload limit'
      });
    }

    // Validate required fields
    if (!formCourseData.id || !formCourseData.title) {
      return {
        success: false,
        message: 'Course ID and title are required'
      };
    }

    // Process thumbnail if provided
    let thumbnailBuffer = null;
    const thumbnailFilename = 'thumbnail.png';

    if (files.thumbnail?.buffer) {
      try {
        // Process image directly from memory buffer, standardizing to PNG
        thumbnailBuffer = await processThumbnailBuffer(files.thumbnail.buffer);
      } catch (error) {
        console.error('Error processing thumbnail:', error);
        throw createError({
          statusCode: 422,
          statusMessage: 'Thumbnail is not a valid image'
        });
      }
    }

    // Re-read after image processing so indexing and concurrent edits survive.
    // Get existing course data
    let existingCourseData = {};
    const existingCourse = db.prepare('SELECT data, thumbnail_data, folder_name FROM courses WHERE id = ?').get(formCourseData.id);

    if (!existingCourse) throw createError({ statusCode: 404, statusMessage: 'Course no longer exists. Refresh the library before editing.' });
    if (existingCourse) {
      try {
        existingCourseData = JSON.parse(existingCourse.data);
      } catch (err) {
        console.error('Error parsing existing course data:', err);
      }
    }

    // Determine folder_name - use existing one or generate from ID
    const folderName = existingCourse?.folder_name || formCourseData.id;

    // Create the updated course data
    const updatedCourseData = {
      ...existingCourseData,
      id: formCourseData.id,
      title: formCourseData.title,
      description: formCourseData.description,
      category: formCourseData.category,
      thumbnail: thumbnailFilename,
      releaseDate: formCourseData.releaseDate,
      lastUpdate: Date.now() // Add timestamp for cache busting
    };

    // Save complete course data to database with thumbnail
    const courseJson = JSON.stringify(updatedCourseData);

    // Save to database
    if (existingCourse) {
      // Update existing course
      if (thumbnailBuffer) {
        // Update with new thumbnail
        db.prepare(`
          UPDATE courses
          SET title = ?, description = ?, folder_name = ?, thumbnail = ?,
              thumbnail_data = ?, category = ?, release_date = ?, data = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          updatedCourseData.title,
          updatedCourseData.description,
          folderName,
          thumbnailFilename,
          thumbnailBuffer,
          updatedCourseData.category,
          updatedCourseData.releaseDate,
          courseJson,
          updatedCourseData.id
        );
      } else {
        // Update without changing thumbnail
        db.prepare(`
          UPDATE courses
          SET title = ?, description = ?, folder_name = ?, thumbnail = ?,
              category = ?, release_date = ?, data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          updatedCourseData.title,
          updatedCourseData.description,
          folderName,
          thumbnailFilename,
          updatedCourseData.category,
          updatedCourseData.releaseDate,
          courseJson,
          updatedCourseData.id
        );
      }
    }

    // After saving to DB, if a thumbnail was processed, save it to the
    // filesystem (best-effort — the DB blob is the source of truth).
    if (thumbnailBuffer) {
      const courseRoot = getCourseRootPath(folderName);
      if (courseRoot) {
        const localThumbnailPath = path.join(courseRoot, thumbnailFilename);
        try {
          // A missing mount must not create a phantom course directory.
          writeFileNoFollow(localThumbnailPath, thumbnailBuffer);
        } catch (error) {
          console.error('Error saving thumbnail to filesystem:', error);
        }
      } else {
        console.error(`Could not determine course root path for folder_name "${folderName}" (ID ${updatedCourseData.id}) to save thumbnail.`);
      }
    }

    return {
      success: true,
      message: 'Course saved successfully',
      course: updatedCourseData,
      databaseUpdated: true
    };
  } catch (error) {
    console.error('Error saving course:', error);
    if (error?.statusCode) throw error;
    return {
      success: false,
      message: error.message || 'Failed to save course'
    };
  }
});
