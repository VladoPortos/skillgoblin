import fs from 'fs';
import path from 'path';
import { generateCourseId, naturalSort } from './courseHelpers';
import { applyCourseJsonOverride } from './courseJsonOverride.js';

// Build a per-video subtitle hint: if `lesson1.srt` exists next to
// `lesson1.mp4`, return the .srt filename so the client can request a
// converted .vtt sibling. Returns null when no sibling exists.
function findSubtitleSibling(videoFilePath) {
  const dir = path.dirname(videoFilePath);
  const base = path.basename(videoFilePath, path.extname(videoFilePath));
  const srtName = `${base}.srt`;
  const candidate = path.join(dir, srtName);
  try {
    return fs.existsSync(candidate) ? srtName : null;
  } catch {
    return null;
  }
}

// Function to generate lessons from the folder structure
export const generateLessonsFromFolder = (coursePath) => {
  const lessons = [];

  const items = fs.readdirSync(coursePath, { withFileTypes: true });
  const lessonDirs = items.filter((item) => item.isDirectory());
  const rootVideos = items.filter(
    (item) => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'),
  );

  if (rootVideos.length > 0) {
    const introVideos = rootVideos.map((video) => {
      const fullPath = path.join(coursePath, video.name);
      const subtitle = findSubtitleSibling(fullPath);
      const entry = {
        title: video.name.replace('.mp4', '').replace(/_/g, ' '),
        file: video.name,
      };
      if (subtitle) entry.subtitle = subtitle;
      return entry;
    });

    introVideos.sort((a, b) => naturalSort(a, b));

    lessons.push({
      id: 'main-content',
      title: 'Main Content',
      folder: '',
      videos: introVideos,
    });
  }

  lessonDirs.forEach((lessonDir) => {
    const lessonPath = path.join(coursePath, lessonDir.name);
    const lessonVideos = fs
      .readdirSync(lessonPath, { withFileTypes: true })
      .filter((item) => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'))
      .map((video) => {
        const fullPath = path.join(lessonPath, video.name);
        const subtitle = findSubtitleSibling(fullPath);
        const entry = {
          title: video.name.replace('.mp4', '').replace(/_/g, ' '),
          file: video.name,
        };
        if (subtitle) entry.subtitle = subtitle;
        return entry;
      });

    if (lessonVideos.length > 0) {
      const lessonId = lessonDir.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

      lessonVideos.sort((a, b) => naturalSort(a, b));

      lessons.push({
        id: lessonId,
        title: lessonDir.name,
        folder: lessonDir.name,
        videos: lessonVideos,
      });
    }
  });

  lessons.sort((a, b) => naturalSort(a, b));
  return lessons;
};

// Generate course metadata from folder structure, then layer course.json
// overrides on top so the operator's intent wins over auto-detection.
export const generateCourseJson = (courseDir, coursePath) => {
  console.log(`Generating course data for ${courseDir}`);

  const courseId = generateCourseId(courseDir);
  const lessons = generateLessonsFromFolder(coursePath);

  const autoDetected = {
    id: courseId,
    title: courseDir,
    description: `Course: ${courseDir}`,
    thumbnail: 'thumbnail.png',
    category: 'Uncategorized',
    releaseDate: new Date().toISOString().split('T')[0],
    lessons,
    lastUpdate: Date.now(),
  };

  const merged = applyCourseJsonOverride(coursePath, autoDetected);
  return merged;
};
