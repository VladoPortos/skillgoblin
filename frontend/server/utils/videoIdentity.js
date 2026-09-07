import { createHash } from 'node:crypto';

// Relative filenames preserve identity when ordering changes. Renaming a file
// deliberately creates a new identity; never transfer progress by list position.
export function stableVideoId(folder, file) {
  return `v-${createHash('sha256').update(JSON.stringify([folder || '', file || ''])).digest('hex').slice(0, 24)}`;
}

export function addVideoIds(course) {
  return { ...course, lessons: (course.lessons || []).map(lesson => ({
    ...lesson, videos: (lesson.videos || []).map(video => ({
      ...video, id: video.id || stableVideoId(lesson.folder, video.file)
    }))
  })) };
}
