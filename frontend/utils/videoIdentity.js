export function getVideoId(lesson, index) {
  return lesson?.videos?.[index]?.id || `${lesson.id}-${index}`;
}
