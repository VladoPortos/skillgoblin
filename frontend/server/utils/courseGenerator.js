import fs from 'fs';
import path from 'path';
import { generateCourseId, naturalSort } from './courseHelpers';

// Function to generate lessons from the folder structure
export const generateLessonsFromFolder = (coursePath) => {
  const lessons = [];
  
  // Get all items in the course directory
  const items = fs.readdirSync(coursePath, { withFileTypes: true });
  
  // Filter for directories (lessons) and MP4 files in the root
  const lessonDirs = items.filter(item => item.isDirectory());
  const rootVideos = items.filter(item => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'));
  
  // If there are MP4 files in the root, create a "Main Content" lesson
  if (rootVideos.length > 0) {
    const introVideos = rootVideos.map(video => ({
      title: video.name.replace('.mp4', '').replace(/_/g, ' '),
      file: video.name
    }));
    
    // Sort intro videos using natural sorting
    introVideos.sort((a, b) => naturalSort(a, b));
    
    const introLesson = {
      id: 'main-content',
      title: 'Main Content',
      folder: '', // No subfolder for root videos
      videos: introVideos
    };
    lessons.push(introLesson);
  }
  
  // Process each lesson directory
  lessonDirs.forEach((lessonDir) => {
    const lessonPath = path.join(coursePath, lessonDir.name);
    const lessonVideos = fs.readdirSync(lessonPath, { withFileTypes: true })
      .filter(item => !item.isDirectory() && item.name.toLowerCase().endsWith('.mp4'))
      .map(video => ({
        title: video.name.replace('.mp4', '').replace(/_/g, ' '),
        file: video.name // Store just the filename, not the full path
      }));
    
    if (lessonVideos.length > 0) {
      // Generate a lesson ID from the folder name
      const lessonId = lessonDir.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      
      // Sort videos using natural sorting
      lessonVideos.sort((a, b) => naturalSort(a, b));
      
      lessons.push({
        id: lessonId,
        title: lessonDir.name,
        folder: lessonDir.name,
        videos: lessonVideos
      });
    }
  });
  
  // Sort lessons by their folder names if they start with numbers
  lessons.sort((a, b) => naturalSort(a, b));
  
  return lessons;
};

// Function to generate a course JSON from folder structure
export const generateCourseJson = (courseDir, coursePath) => {
  console.log(`Generating course data for ${courseDir}`);
  
  // Create course ID from directory name
  const courseId = generateCourseId(courseDir);
  
  // Generate lessons from folder structure
  const lessons = generateLessonsFromFolder(coursePath);
  
  // Create the course data object directly from directory structure
  return {
    id: courseId,
    title: courseDir,
    description: `Course: ${courseDir}`,
    thumbnail: 'thumbnail.png', // Always use standardized name
    category: 'Uncategorized',
    releaseDate: new Date().toISOString().split('T')[0],
    lessons: lessons,
    lastUpdate: Date.now() // Add timestamp for cache busting
  };
};
