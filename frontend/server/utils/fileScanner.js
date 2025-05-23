import fs from 'fs';
import path from 'path';
import { getDb } from './db';
import { getContentDir } from './courseHelpers';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv', '.srt'];
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

  const contentDir = getContentDir();
  const courseBasePath = path.join(contentDir, courseData.folder_name);

  if (!fs.existsSync(courseBasePath)) {
    return { courseTitle: courseData.title, filesByFolder: [] };
  }

  const filesByFolder = [];

  function walkDir(currentPath, relativeBase = '') {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryNameLower = entry.name.toLowerCase();
      if (SYSTEM_FILES_TO_IGNORE.includes(entryNameLower)) {
        continue;
      }

      const fullEntryPath = path.join(currentPath, entry.name);
      // Replace backslashes with forward slashes for consistent relative paths
      const relativeEntryPath = path.join(relativeBase, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walkDir(fullEntryPath, relativeEntryPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        
        if (VIDEO_EXTENSIONS.includes(ext) || EXCLUDED_FILES.includes(entry.name.toLowerCase())) {
          continue;
        }

        const stats = fs.statSync(fullEntryPath);
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

  walkDir(courseBasePath);

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
