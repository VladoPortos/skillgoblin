// Given a course's lessons array and a per-user progress shape
//   { completed: { [`${lessonId}-${index}`]: true }, progress: { [`${lessonId}-${index}`]: 0..100 } }
// return the first not-completed video and its seek ratio (0..<1).
//
// If every video is completed, returns the last video with seekRatio=0.
// Returns null only when the lessons array is empty.
//
// Pure function — no DOM, no fetch, no localStorage.
export function pickNextNotCompleted(lessons, progress) {
  if (!Array.isArray(lessons) || lessons.length === 0) return null;
  const completed = (progress && progress.completed) || {};
  const partials = (progress && progress.progress) || {};

  let lastVideo = null;
  for (let li = 0; li < lessons.length; li += 1) {
    const lesson = lessons[li];
    if (!lesson || !Array.isArray(lesson.videos)) continue;
    for (let vi = 0; vi < lesson.videos.length; vi += 1) {
      const id = `${lesson.id}-${vi}`;
      lastVideo = { lessonId: lesson.id, videoIndex: vi };
      if (completed[id]) continue;
      const raw = Number(partials[id]) || 0;
      const clamped = Math.max(0, Math.min(99.999, raw));
      return {
        lessonId: lesson.id,
        videoIndex: vi,
        seekRatio: clamped / 100,
      };
    }
  }
  if (!lastVideo) return null;
  return { ...lastVideo, seekRatio: 0 };
}
