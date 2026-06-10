import fs from 'fs';
import path from 'path';
import { getDb } from './db';
import { resolveCourseDir, VIDEO_EXTENSIONS } from './courseHelpers';

// Files skipped when listing downloadable course extras: real videos
// (served by the player, not the file list), unsupported video containers,
// and subtitle .srt files (consumed via the on-the-fly .vtt conversion).
const SKIPPED_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, '.mov', '.webm', '.flv', '.wmv', '.srt']);
const EXCLUDED_FILES = ['thumbnail.png', 'course.json'];
const SYSTEM_FILES_TO_IGNORE = ['.ds_store', 'thumbs.db']; // Lowercase for case-insensitive comparison

function getCourseDataById(courseId) {
  const db = getDb();
  const course = db.prepare('SELECT folder_name, title FROM courses WHERE id = ?').get(courseId);
  return course;
}

function formatSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function scanCourseFiles(courseId) {
  const courseData = getCourseDataById(courseId);
  if (!courseData || !courseData.folder_name) {
    throw new Error('Course folder not found for the given ID.');
  }

  let courseBasePath;
  try {
    courseBasePath = resolveCourseDir(courseData.folder_name);
  } catch {
    throw new Error('Invalid course folder.');
  }

  try {
    await fs.promises.access(courseBasePath);
  } catch {
    return { courseTitle: courseData.title, filesByFolder: [] };
  }

  const filesByFolder = [];

  async function walkDir(currentPath, relativeBase = '') {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryNameLower = entry.name.toLowerCase();
      if (SYSTEM_FILES_TO_IGNORE.includes(entryNameLower)) {
        continue;
      }

      const fullEntryPath = path.join(currentPath, entry.name);
      // Replace backslashes with forward slashes for consistent relative paths
      const relativeEntryPath = path.join(relativeBase, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        await walkDir(fullEntryPath, relativeEntryPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        if (SKIPPED_EXTENSIONS.has(ext) || EXCLUDED_FILES.includes(entry.name.toLowerCase())) {
          continue;
        }

        const stats = await fs.promises.stat(fullEntryPath);
        const fileData = {
          name: entry.name,
          size: stats.size,
          formattedSize: formatSize(stats.size),
          extension: ext.startsWith('.') ? ext.substring(1) : ext,
          downloadPath: relativeEntryPath,
        };

        const parentDirDisplayPath = relativeBase.replace(/\\/g, '/') || '.';
        let folderGroup = filesByFolder.find(f => f.relativePathForDisplay === parentDirDisplayPath);

        if (!folderGroup) {
          folderGroup = {
            folderName: relativeBase === '' ? 'Root Files' : relativeBase.replace(/\\/g, '/'),
            relativePathForDisplay: parentDirDisplayPath,
            files: [],
          };
          filesByFolder.push(folderGroup);
        }
        folderGroup.files.push(fileData);
      }
    }
  }

  await walkDir(courseBasePath);

  filesByFolder.sort((a, b) => {
    if (a.relativePathForDisplay === '.') return -1;
    if (b.relativePathForDisplay === '.') return 1;
    return a.folderName.localeCompare(b.folderName);
  });
  
  filesByFolder.forEach(folder => {
    folder.files.sort((a, b) => a.name.localeCompare(b.name));
  });

  return { courseTitle: courseData.title, filesByFolder };
}
