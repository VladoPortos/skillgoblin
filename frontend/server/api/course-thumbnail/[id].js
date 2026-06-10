import { getDb } from '../../utils/db';
import { defineEventHandler, createError, setResponseHeader } from 'h3';
import { loadThumbnail } from '../../utils/thumbnailUtils';

export default defineEventHandler(async (event) => {
  try {
    // Get course ID from the URL
    const courseId = event.context.params.id;

    // Check if there's a cache-busting parameter
    const url = new URL(event.node.req.url, 'http://localhost');
    const cacheBuster = url.searchParams.get('t');

    // Get the thumbnail from the database, falling back to the placeholder
    const db = getDb();
    const { data, isPlaceholder } = await loadThumbnail(db, courseId);

    // Set appropriate headers
    setResponseHeader(event, 'Content-Type', 'image/png');
    setResponseHeader(event, 'Content-Length', data.length);

    // Add cache control headers
    if (cacheBuster) {
      setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000'); // Cache for a year
      setResponseHeader(event, 'ETag', `"${cacheBuster}"`);
    } else if (isPlaceholder) {
      setResponseHeader(event, 'Cache-Control', 'no-cache');
    } else {
      setResponseHeader(event, 'Cache-Control', 'public, max-age=3600'); // 1 hour
    }

    // Return the thumbnail data
    return Buffer.from(data);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to serve thumbnail'
    });
  }
});
