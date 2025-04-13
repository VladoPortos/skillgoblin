import { getDb } from '../../utils/db';
import { defineEventHandler, createError, setResponseHeader } from 'h3';
import fs from 'fs';

// Create a buffer with placeholder image for reuse
const placeholderImageBuffer = fs.readFileSync('public/images/placeholder.png');

export default defineEventHandler(async (event) => {
  try {
    // Get course ID from the URL
    const courseId = event.context.params.id;
    
    if (!courseId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Course ID is required'
      });
    }

    // Check if there's a cache-busting parameter
    const url = new URL(event.node.req.url, 'http://localhost');
    const cacheBuster = url.searchParams.get('t');
    
    // Get the thumbnail from the database
    const db = getDb();
    const result = db.prepare('SELECT thumbnail_data FROM courses WHERE id = ?').get(courseId);
    
    if (!result || !result.thumbnail_data) {
      // If no thumbnail in database, serve the placeholder
      console.log(`No thumbnail found in database for course: ${courseId}`);
      
      // Set appropriate headers
      setResponseHeader(event, 'Content-Type', 'image/png');
      setResponseHeader(event, 'Content-Length', placeholderImageBuffer.length);
      
      // Add cache control headers with the cache buster
      if (cacheBuster) {
        setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000'); // Cache for a year
        setResponseHeader(event, 'ETag', `"${cacheBuster}"`);
      } else {
        setResponseHeader(event, 'Cache-Control', 'no-cache');
      }
      
      // Serve the placeholder image from memory
      return placeholderImageBuffer;
    }
    
    // Set appropriate headers
    setResponseHeader(event, 'Content-Type', 'image/png');
    setResponseHeader(event, 'Content-Length', result.thumbnail_data.length);
    
    // Add cache control headers
    if (cacheBuster) {
      setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000'); // Cache for a year
      setResponseHeader(event, 'ETag', `"${cacheBuster}"`);
    } else {
      setResponseHeader(event, 'Cache-Control', 'public, max-age=3600'); // 1 hour
    }
    
    // Return the thumbnail data
    return Buffer.from(result.thumbnail_data);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to serve thumbnail'
    });
  }
});
