import { getDb } from '../../utils/db';
import busboy from 'busboy';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { getCourseRootPath } from '../../utils/thumbnailUtils';

export default defineEventHandler(async (event) => {
  // Get the user ID from the request headers (set by the client)
  const userId = event.node.req.headers['x-user-id'];
  
  if (!userId) {
    console.error('No user ID found in request headers');
    return {
      success: false,
      message: 'Authentication required'
    };
  }

  // Check if user is admin
  const db = getDb();
  const user = db.prepare('SELECT isAdmin FROM users WHERE id = ?').get(userId);
  
  if (!user || user.isAdmin !== 1) {
    console.error('User is not admin:', userId);
    return {
      success: false,
      message: 'Unauthorized. Only admin users can edit courses.'
    };
  }

  try {
    // Parse multipart form data directly to memory
    const { fields, files } = await new Promise((resolve, reject) => {
      const bb = busboy({ 
        headers: event.node.req.headers,
        limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
      });
      
      const formData = { fields: {}, files: {} };
      
      bb.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => {
          formData.files[name] = {
            buffer: Buffer.concat(chunks),
            info
          };
        });
      });
      
      bb.on('field', (name, value) => {
        formData.fields[name] = value;
      });
      
      bb.on('close', () => resolve(formData));
      bb.on('error', reject);
      
      event.node.req.pipe(bb);
    });

    // Parse the course data from JSON
    const formCourseData = JSON.parse(fields.course);
    
    // Validate required fields
    if (!formCourseData.id || !formCourseData.title) {
      return {
        success: false,
        message: 'Course ID and title are required'
      };
    }

    // Get existing course data
    let existingCourseData = {};
    const existingCourse = db.prepare('SELECT data, thumbnail_data, folder_name FROM courses WHERE id = ?').get(formCourseData.id);
    
    if (existingCourse) {
      try {
        existingCourseData = JSON.parse(existingCourse.data);
      } catch (err) {
        console.error('Error parsing existing course data:', err);
      }
    }

    // Process thumbnail if provided
    let thumbnailBuffer = null;
    const thumbnailFilename = 'thumbnail.png';
    
    if (files.thumbnail?.buffer) {
      try {
        // Process image directly from memory buffer
        thumbnailBuffer = await sharp(files.thumbnail.buffer)
          .resize(480, 270, {
            fit: 'cover',
            position: 'center'
          })
          .png({ quality: 90, compressionLevel: 6 }) // Standardize to PNG
          .toBuffer();
        
        console.log('Thumbnail processed successfully');
      } catch (error) {
        console.error('Error processing thumbnail:', error);
        thumbnailBuffer = existingCourse?.thumbnail_data;
      }
    } else {
      thumbnailBuffer = existingCourse?.thumbnail_data;
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
        updatedCourseData.id,
        updatedCourseData.title,
        updatedCourseData.description,
        folderName,
        thumbnailFilename,
        thumbnailBuffer,
        updatedCourseData.category,
        updatedCourseData.releaseDate,
        courseJson
      );
    }
    
    console.log(`Course saved to database: ${updatedCourseData.id}`);

    // After saving to DB, if a thumbnail was processed, save it to the filesystem
    if (thumbnailBuffer) {
      const courseId = formCourseData.id;
      let folderName = '';
      try {
        const courseInfo = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
        if (courseInfo && courseInfo.folder_name) {
          folderName = courseInfo.folder_name;
        } else {
          console.error(`Could not find folder_name for course ID ${courseId}. Cannot save thumbnail to filesystem.`);
          // Optionally, decide if you want to proceed without saving to FS or return an error
          return; // Or handle error appropriately
        }
      } catch (dbError) {
        console.error(`Error fetching folder_name for course ID ${courseId}:`, dbError);
        return; // Or handle error appropriately
      }

      const courseRoot = getCourseRootPath(folderName);
      if (courseRoot) {
        const localThumbnailPath = path.join(courseRoot, thumbnailFilename);
        try {
          if (!fs.existsSync(courseRoot)) {
            fs.mkdirSync(courseRoot, { recursive: true });
          }
          fs.writeFileSync(localThumbnailPath, thumbnailBuffer);
          console.log(`Thumbnail saved to filesystem: ${localThumbnailPath}`);
        } catch (error) {
          console.error('Error saving thumbnail to filesystem:', error);
        }
      } else {
        // This case should be less likely now if folderName is valid
        console.error(`Could not determine course root path for folder_name "${folderName}" (ID ${courseId}) to save thumbnail.`);
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
    return {
      success: false,
      message: error.message || 'Failed to save course'
    };
  }
});
