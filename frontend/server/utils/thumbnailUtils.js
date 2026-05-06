import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { resolveCourseDir } from './courseHelpers';

const execFileAsync = promisify(execFile);

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
 * Plex-style local-asset detection. Priority order: explicit `thumbnail.*`
 * first (the historical canonical name), then the conventional `cover.*` /
 * `poster.*` / `folder.*` names that most downloaded course bundles ship
 * with. Each pair matches case-insensitively (`Cover.JPG` and `cover.jpg`
 * are equivalent), which is essential for course folders authored on
 * case-preserving Windows / macOS filesystems but served from a case-
 * sensitive Linux container.
 */
const THUMBNAIL_NAME_PRIORITY = ['thumbnail', 'cover', 'poster', 'folder'];
const THUMBNAIL_EXT_PRIORITY = ['png', 'jpg', 'jpeg', 'webp'];

/**
 * Look for a course-supplied thumbnail in the course folder.
 * Enumerates the directory once, normalizes entry names to lowercase, and
 * resolves matches in (name, extension) priority order. Skips zero-byte
 * files and non-files so a directory named `cover.jpg` can't masquerade.
 * @param {string} courseRoot - Absolute path to the course root.
 * @returns {string|null} Absolute path to the first matching file, or null.
 */
export const findLocalThumbnailPath = (courseRoot) => {
  if (!courseRoot) return null;
  let entries;
  try {
    entries = fs.readdirSync(courseRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[thumb] cannot list ${courseRoot}: ${err.message}`);
    }
    return null;
  }
  // Build "<basename-lower>.<ext-lower>" → real filename. Keep the first
  // entry seen for each key so duplicates differing only in case (e.g.
  // `cover.jpg` and `Cover.jpg` on a case-sensitive FS) resolve to the
  // earlier-listed one rather than flickering between scans.
  const byKey = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extWithDot = path.extname(entry.name);
    if (!extWithDot) continue;
    const base = path.basename(entry.name, extWithDot).toLowerCase();
    const ext = extWithDot.slice(1).toLowerCase();
    const key = `${base}.${ext}`;
    if (!byKey.has(key)) byKey.set(key, entry.name);
  }
  for (const base of THUMBNAIL_NAME_PRIORITY) {
    for (const ext of THUMBNAIL_EXT_PRIORITY) {
      const realName = byKey.get(`${base}.${ext}`);
      if (!realName) continue;
      const full = path.join(courseRoot, realName);
      try {
        const stat = fs.statSync(full);
        if (stat.size > 0) return full;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.warn(`[thumb] cannot stat ${full}: ${err.message}`);
        }
      }
    }
  }
  return null;
};

/**
 * Reads a thumbnail image file, processes it with sharp, and returns a buffer.
 * @param {string} thumbnailPath - Absolute path to the thumbnail file.
 * @returns {Promise<Buffer|null>} Processed image buffer or null if an error occurs.
 */
export const readAndProcessThumbnail = async (thumbnailPath) => {
  try {
    if (!fs.existsSync(thumbnailPath)) {
      return null;
    }
    const fileBuffer = fs.readFileSync(thumbnailPath);
    // Force PNG output regardless of input format. /api/course-thumbnail/:id
    // serves the cached blob with Content-Type: image/png, so a JPEG or WebP
    // cover dropped in the course folder would otherwise be served with the
    // wrong MIME type and mis-render in strict clients.
    const processedBuffer = await sharp(fileBuffer)
      .resize(480, 270, {
        fit: 'cover',
        position: 'center',
      })
      .png()
      .toBuffer();
    return processedBuffer;
  } catch (error) {
    console.error(`Error processing thumbnail at ${thumbnailPath}:`, error);
    return null;
  }
};

/**
 * Probe the duration of a video file. Used to compute a 10%-into-the-video
 * seek target for the frame-extract thumbnail fallback.
 * @param {string} videoPath
 * @returns {Promise<number|null>} Duration in seconds, or null on any failure.
 */
const probeVideoDuration = async (videoPath) => {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ],
      { timeout: 10_000 }
    );
    const seconds = parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[thumb] ffprobe failed for ${videoPath}: ${err.message}`);
    }
    return null;
  }
};

/**
 * Extract a single JPEG frame at ~10% into the video, then run it through
 * sharp so the cached blob has the same shape as a normal thumbnail. Returns
 * null on any failure (missing ffmpeg, unreadable video, etc.) — the caller
 * is expected to fall back gracefully.
 *
 * Used by synchronizeCourseThumbnail when the operator did NOT drop a cover
 * image in the course folder AND the DB has no cached blob yet.
 * @param {string} videoPath - Absolute path to a video file (typically the
 *   first lesson's first video).
 * @returns {Promise<Buffer|null>}
 */
export const extractFrameThumbnail = async (videoPath) => {
  if (!videoPath) return null;
  try {
    const stat = fs.statSync(videoPath);
    if (!stat.isFile() || stat.size === 0) return null;
  } catch {
    return null;
  }

  // Seek to 10% of the duration. Without ffprobe we'd be guessing; without a
  // duration we'd risk feeding ffmpeg `-ss` past the end and getting an empty
  // stream. Floor at 1s so we don't seek to frame 0 of an unusually short clip.
  const duration = await probeVideoDuration(videoPath);
  const seekSec = duration ? Math.max(1, duration * 0.1) : 30;

  const rawFrame = await new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(
        'ffmpeg',
        [
          '-loglevel', 'error',
          '-ss', String(seekSec),       // -ss before -i = fast input seek
          '-i', videoPath,
          '-frames:v', '1',
          '-f', 'image2',
          '-c:v', 'mjpeg',
          '-',                          // write to stdout
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      console.warn(`[thumb] ffmpeg spawn failed: ${err.message}`);
      return resolve(null);
    }

    const chunks = [];
    let stderrBuf = '';
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });

    let settled = false;
    const finish = (val) => { if (!settled) { settled = true; resolve(val); } };

    proc.on('error', (err) => {
      console.warn(`[thumb] ffmpeg error for ${videoPath}: ${err.message}`);
      finish(null);
    });
    proc.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        if (stderrBuf.trim()) {
          console.warn(`[thumb] ffmpeg exited ${code} for ${videoPath}: ${stderrBuf.trim()}`);
        }
        return finish(null);
      }
      finish(Buffer.concat(chunks));
    });
  });

  if (!rawFrame) return null;
  try {
    // Force PNG output so the cached blob matches what the thumbnail
    // endpoint advertises (Content-Type: image/png).
    return await sharp(rawFrame)
      .resize(480, 270, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn(`[thumb] sharp failed to process extracted frame for ${videoPath}: ${err.message}`);
    return null;
  }
};
