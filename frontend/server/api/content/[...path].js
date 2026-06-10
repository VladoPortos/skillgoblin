import fs from 'fs';
import path from 'path';
import { defineEventHandler, getRequestURL, createError, setResponseHeader, getRequestHeaders } from 'h3';
import zlib from 'zlib';
import { getDb } from '../../utils/db'; // Added for database access
import { getContentDir, generateCourseId, resolveCourseById, resolveCourseDir, resolvePathInCourse, VIDEO_EXTENSIONS } from '../../utils/courseHelpers';
import { loadThumbnail } from '../../utils/thumbnailUtils';

// Cache to store open file handles and their last access time
const fileHandleCache = new Map();
const FILE_CACHE_TTL = 60 * 1000; // 1 minute TTL for file handles
const MAX_CACHED_FILES = 30; // Increased from 20 to 30
const MAX_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB maximum chunk size

// Content chunk cache for faster delivery of frequently accessed chunks
const contentChunkCache = new Map();
const CHUNK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL for content chunks
const MAX_CACHED_CHUNKS = 100; // Maximum number of chunks to keep in cache
const MAX_CACHED_CHUNK_SIZE = 1024 * 512; // Only cache chunks up to 512KB

// Thumbnail cache to avoid repeated file system operations
const thumbnailCache = new Map();
const THUMBNAIL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes TTL for thumbnails
const MAX_CACHED_THUMBNAILS = 50; // Maximum number of thumbnails to keep in cache

// Clean up stale file handles and content chunks periodically
setInterval(() => {
  const now = Date.now();
  
  // Clean file handles
  for (const [filePath, { handle, lastAccessed }] of fileHandleCache.entries()) {
    if (now - lastAccessed > FILE_CACHE_TTL) {
      handle.close();
      fileHandleCache.delete(filePath);
    }
  }
  
  // Clean content chunks
  for (const [chunkKey, { lastAccessed }] of contentChunkCache.entries()) {
    if (now - lastAccessed > CHUNK_CACHE_TTL) {
      contentChunkCache.delete(chunkKey);
    }
  }
  
  // Clean thumbnail cache
  for (const [thumbnailKey, { lastAccessed }] of thumbnailCache.entries()) {
    if (now - lastAccessed > THUMBNAIL_CACHE_TTL) {
      thumbnailCache.delete(thumbnailKey);
    }
  }
}, 30 * 1000).unref(); // Check every 30 seconds

// Get a file handle from cache or create a new one
const getFileHandle = async (filePath) => {
  if (fileHandleCache.has(filePath)) {
    const cache = fileHandleCache.get(filePath);
    cache.lastAccessed = Date.now();
    return cache.handle;
  }

  // If we've reached the max cached files, remove the oldest one
  if (fileHandleCache.size >= MAX_CACHED_FILES) {
    let oldestPath = null;
    let oldestTime = Infinity;
    
    for (const [path, { lastAccessed }] of fileHandleCache.entries()) {
      if (lastAccessed < oldestTime) {
        oldestTime = lastAccessed;
        oldestPath = path;
      }
    }
    
    if (oldestPath) {
      const { handle } = fileHandleCache.get(oldestPath);
      handle.close();
      fileHandleCache.delete(oldestPath);
    }
  }

  // Open a new file handle
  const handle = await fs.promises.open(filePath, 'r');
  fileHandleCache.set(filePath, { handle, lastAccessed: Date.now() });
  return handle;
};

// Get content chunk from cache or read from file
const getContentChunk = async (filePath, start, end) => {
  const chunkKey = `${filePath}:${start}-${end}`;
  const chunkSize = end - start + 1;
  
  // Only use the cache for chunks that aren't too large
  if (chunkSize <= MAX_CACHED_CHUNK_SIZE) {
    if (contentChunkCache.has(chunkKey)) {
      const cache = contentChunkCache.get(chunkKey);
      cache.lastAccessed = Date.now();
      return cache.data;
    }
  
    // If we've reached the max cached chunks, remove the oldest one
    if (contentChunkCache.size >= MAX_CACHED_CHUNKS) {
      let oldestKey = null;
      let oldestTime = Infinity;
      
      for (const [key, { lastAccessed }] of contentChunkCache.entries()) {
        if (lastAccessed < oldestTime) {
          oldestTime = lastAccessed;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        contentChunkCache.delete(oldestKey);
      }
    }
  }
  
  // Read the content chunk
  const handle = await getFileHandle(filePath);
  const buffer = Buffer.alloc(chunkSize);
  await handle.read(buffer, 0, chunkSize, start);
  
  // Store in cache if not too large
  if (chunkSize <= MAX_CACHED_CHUNK_SIZE) {
    contentChunkCache.set(chunkKey, { 
      data: buffer, 
      lastAccessed: Date.now() 
    });
  }
  
  return buffer;
};

// Prefetch next chunk (called after serving a chunk)
const prefetchNextChunk = (filePath, currentEnd, fileSize) => {
  const prefetchStart = currentEnd + 1;
  const prefetchSize = Math.min(MAX_CHUNK_SIZE, fileSize - prefetchStart);
  
  // Skip prefetch for very small remaining parts
  if (prefetchSize < 64 * 1024) return;
  
  // Asynchronously prefetch without waiting
  getContentChunk(filePath, prefetchStart, prefetchStart + prefetchSize - 1)
    .catch(err => {
      // Just log errors, don't disrupt the main flow
      console.error(`Prefetch error for ${filePath}: ${err.message}`);
    });
};

// Check if compression should be used
const shouldCompress = (req, contentType) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  // Only compress certain content types
  const compressibleTypes = [
    'text/', 'application/javascript', 'application/json', 
    'application/xml', 'image/svg+xml'
  ];
  
  // Don't compress already compressed formats
  const alreadyCompressed = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'audio/mp3', 'audio/mpeg'
  ];
  
  // Check if content type is compressible
  const isCompressible = compressibleTypes.some(type => contentType.includes(type));
  const isAlreadyCompressed = alreadyCompressed.some(type => contentType === type);
  
  return isCompressible && !isAlreadyCompressed && acceptEncoding.includes('gzip');
};

export default defineEventHandler(async (event) => {
  let fileStream = null;
  const db = getDb(); // Get DB connection instance
  
  try {
    // Get the requested path
    const url = getRequestURL(event);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // Remove 'api' and 'content' from the path
    pathSegments.shift(); // Remove 'api'
    pathSegments.shift(); // Remove 'content'
    
    // Decode URL components to handle spaces and special characters
    const decodedSegments = pathSegments.map(segment => decodeURIComponent(segment));
    
    const courseIdFromPath = decodedSegments[0]; // Get potential course ID from path
    
    // --- BEGIN THUMBNAIL HANDLING --- 
    if (decodedSegments.length === 2 && decodedSegments[1] === 'thumbnail.png') {
      const courseId = courseIdFromPath;
      // Include the request URL's query string in the cache key
      const queryString = event.node.req.url.split('?')[1] || '';
      const cacheKey = `thumbnail:${courseId}:${queryString}`;
      const now = Date.now();

      // 1. Check Thumbnail Cache
      if (thumbnailCache.has(cacheKey)) {
        const cachedThumbnail = thumbnailCache.get(cacheKey);
        cachedThumbnail.lastAccessed = now; // Update access time
        setResponseHeader(event, 'Content-Type', 'image/png');
        setResponseHeader(event, 'Content-Length', cachedThumbnail.data.length);
        // Use no-cache for thumbnails to ensure revalidation
        setResponseHeader(event, 'Cache-Control', 'no-cache, must-revalidate');
        setResponseHeader(event, 'Pragma', 'no-cache');
        setResponseHeader(event, 'Expires', '0');
        setResponseHeader(event, 'X-Content-Source', 'Cache');
        return cachedThumbnail.data;
      }
      
      // 2/3. Load from DB or fall back to the placeholder
      const { data: dataToServe, isPlaceholder } = await loadThumbnail(db, courseId);

      // 4. Cache the result (DB data or placeholder)
      if (thumbnailCache.size >= MAX_CACHED_THUMBNAILS) {
        // Basic LRU eviction (can be optimized)
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [key, { lastAccessed }] of thumbnailCache.entries()) {
          if (lastAccessed < oldestTime) {
            oldestTime = lastAccessed;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          thumbnailCache.delete(oldestKey);
        }
      }
      thumbnailCache.set(cacheKey, { data: dataToServe, lastAccessed: now });
      
      // 5. Set Headers and Return Thumbnail/Placeholder
      setResponseHeader(event, 'Content-Type', 'image/png');
      setResponseHeader(event, 'Content-Length', dataToServe.length);
      // Use no-cache for thumbnails to ensure revalidation
      setResponseHeader(event, 'Cache-Control', 'no-cache, must-revalidate');
      setResponseHeader(event, 'Pragma', 'no-cache');
      setResponseHeader(event, 'Expires', '0');
      setResponseHeader(event, 'X-Content-Source', isPlaceholder ? 'Placeholder' : 'Database');
      return dataToServe; // End request handling for thumbnails
    }
    // --- END THUMBNAIL HANDLING ---
    
    // --- BEGIN NON-THUMBNAIL FILE HANDLING (Filesystem based) ---
    // Find the actual folder name that matches the course ID
    let actualCourseFolder = null;
    let courseDir = null;
    try {
      ({ folderName: actualCourseFolder, courseDir } = resolveCourseById(db, courseIdFromPath));
    } catch (err) {
      if (err?.statusCode !== 404) throw err;
      // Fallback: Scan directories if not found in DB (legacy support? or error?)
      console.warn(`Course ID ${courseIdFromPath} not found in DB or missing folder_name, attempting filesystem scan...`);
      const courseDirs = (await fs.promises.readdir(getContentDir(), { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      for (const dir of courseDirs) {
        if (generateCourseId(dir) === courseIdFromPath) {
          actualCourseFolder = dir;
          break;
        }
      }
    }

    if (!actualCourseFolder) {
      console.error(`Course folder could not be determined for ID: ${courseIdFromPath}`);
      throw createError({
        statusCode: 404,
        statusMessage: 'Course not found'
      });
    }

    // Construct the path to the content file
    if (!courseDir) {
      try {
        courseDir = resolveCourseDir(actualCourseFolder);
      } catch (err) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
      }
    }
    let filePath;
    try {
      filePath = resolvePathInCourse(courseDir, ...decodedSegments.slice(1));
    } catch (err) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid content path' });
    }

    // Get file stats (a single stat doubles as the existence check)
    let stats = null;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // .vtt requests: if the file doesn't exist on disk but a sibling .srt does,
    // convert and serve. This lets operators drop an .srt next to the video and
    // have the player consume a real WebVTT track.
    if (!stats && path.extname(filePath).toLowerCase() === '.vtt') {
      const srtCandidate = filePath.slice(0, -4) + '.srt';
      try {
        const { convertSrtFileToVtt } = await import('../../utils/srtToVtt.js');
        const vttBuffer = await convertSrtFileToVtt(srtCandidate, fs);
        setResponseHeader(event, 'Content-Type', 'text/vtt; charset=utf-8');
        setResponseHeader(event, 'Content-Length', vttBuffer.length);
        setResponseHeader(event, 'Cache-Control', 'public, max-age=600');
        return vttBuffer;
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          // No .srt sibling — fall through to the normal not-found handling below.
        } else {
          console.error(`SRT to VTT conversion failed for ${srtCandidate}:`, err);
          throw createError({ statusCode: 500, statusMessage: 'Subtitle conversion failed' });
        }
      }
    }
    // Check if the file exists
    if (!stats) {
      console.error(`File not found (non-thumbnail): ${filePath}`);
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      });
    }

    // Determine content type based on file extension
    let contentType = 'application/octet-stream';
    const ext = path.extname(filePath).toLowerCase();

    // We label all video extensions as video/mp4 because mainstream desktop
    // browsers decode by codec rather than by container, so an .mkv or .avi
    // holding H.264+AAC plays fine.
    const isVideo = VIDEO_EXTENSIONS.has(ext);

    if (isVideo) {
      contentType = 'video/mp4';
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.png') {
      contentType = 'image/png';
    } else if (ext === '.js') {
      contentType = 'application/javascript';
    } else if (ext === '.css') {
      contentType = 'text/css';
    } else if (ext === '.html') {
      contentType = 'text/html';
    } else if (ext === '.json') {
      contentType = 'application/json';
    } else if (ext === '.svg') {
      contentType = 'image/svg+xml';
    }
    
    // Set content type header
    setResponseHeader(event, 'Content-Type', contentType);
    
    // Common headers for all responses
    setResponseHeader(event, 'Connection', 'keep-alive');
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff');
    
    // Check if we should use compression
    const useCompression = shouldCompress(event.node.req, contentType);
    
    // Handle video streaming with proper range support
    if (isVideo) {
      setResponseHeader(event, 'Accept-Ranges', 'bytes');
      
      // Add caching headers for videos
      setResponseHeader(event, 'Cache-Control', 'public, max-age=3600'); // 1 hour cache
      
      const range = getRequestHeaders(event).range;
      
      // If range header exists
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        
        // Calculate end position with chunk size limitation
        const requestedEnd = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const maxEnd = Math.min(start + MAX_CHUNK_SIZE - 1, stats.size - 1);
        const end = Math.min(requestedEnd, maxEnd);
        
        const chunkSize = (end - start) + 1;

        // Set headers for range response
        setResponseHeader(event, 'Content-Range', `bytes ${start}-${end}/${stats.size}`);
        setResponseHeader(event, 'Content-Length', chunkSize);
        event.node.res.statusCode = 206; // Partial content
        
        try {
          // Get content chunk from cache or file
          const buffer = await getContentChunk(filePath, start, end);
          
          // Prefetch next chunk asynchronously (don't await)
          prefetchNextChunk(filePath, end, stats.size);
          
          // Send the buffer directly
          return buffer;
        } catch (err) {
          console.error(`Error reading file range: ${err.message}`);
          throw createError({
            statusCode: 500,
            statusMessage: 'Error reading file'
          });
        }
      } else {
        // For full file requests, we'll still use streams but with better error handling
        setResponseHeader(event, 'Content-Length', stats.size);
        
        // For large files, encourage clients to use range requests instead
        if (stats.size > 20 * 1024 * 1024) { // 20MB
          return createError({
            statusCode: 413,
            statusMessage: 'Request Entity Too Large - Use Range Requests'
          });
        }
        
        // For smaller files, serve them directly
        fileStream = fs.createReadStream(filePath, {
          highWaterMark: 128 * 1024 // Increased buffer size to 128KB
        });
      }
    } else {
      // For non-video files, set content length
      
      // Add appropriate caching for static assets
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        // Check if this is a thumbnail.png file - if so, prevent caching
        if (path.basename(filePath) === 'thumbnail.png') {
          // No caching for thumbnails
          setResponseHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          setResponseHeader(event, 'Pragma', 'no-cache');
          setResponseHeader(event, 'Expires', '0');
        } else {
          // Regular caching for other images
          setResponseHeader(event, 'Cache-Control', 'public, max-age=86400'); // 24 hours
        }
      } else if (['.js', '.css'].includes(ext)) {
        setResponseHeader(event, 'Cache-Control', 'public, max-age=3600'); // 1 hour
      }
      
      // Apply compression if appropriate
      if (useCompression) {
        setResponseHeader(event, 'Content-Encoding', 'gzip');
        fileStream = fs.createReadStream(filePath);
        return fileStream.pipe(zlib.createGzip());
      } else {
        setResponseHeader(event, 'Content-Length', stats.size);
        fileStream = fs.createReadStream(filePath);
      }
    }
    
    if (fileStream) {
      // Handle connection close to clean up resources
      event.node.req.on('close', () => {
        if (fileStream) {
          fileStream.destroy();
        }
      });
      
      // Handle errors on the request
      event.node.req.on('error', (err) => {
        console.error(`Request error, cleaning up file stream for: ${filePath}`, err);
        if (fileStream) {
          fileStream.destroy();
        }
      });
      
      // Handle errors on the stream
      fileStream.on('error', (err) => {
        console.error(`Stream error for: ${filePath}`, err);
        fileStream.destroy();
        
        if (!event.node.res.headersSent) {
          event.node.res.statusCode = 500;
          event.node.res.end('Internal Server Error');
        }
      });
      
      // Return the file stream
      return fileStream;
    }
  } catch (error) {
    // Clean up file stream on error
    if (fileStream) {
      fileStream.destroy();
    }

    // Already-shaped h3 errors carry an intentional status/message; anything
    // else stays generic so internals don't leak to clients.
    if (error && error.statusCode) {
      throw error;
    }
    console.error('Error serving content:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    });
  }
});
