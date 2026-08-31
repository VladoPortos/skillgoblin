// Shared plumbing for the user-favorites and user-progress-courses
// endpoints: load + parse a user's progress JSON blob and fetch full course
// rows for a set of course IDs.

// Returns the parsed progress object, or null when the user has no progress
// row. Throws on malformed JSON — callers map that to their error shape.
export function loadProgressData(db, userId) {
  const row = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
  if (!row || !row.progress) return null;
  return JSON.parse(row.progress);
}

// Fetch course rows for the given IDs and parse their data JSON. Rows whose
// data fails to parse are dropped (with an error log) rather than failing
// the whole request.
export function fetchCoursesByIds(db, courseIds) {
  if (!courseIds.length) return [];
  const placeholders = courseIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, data, created_at FROM courses
    WHERE id IN (${placeholders})
  `).all(courseIds);

  return rows.map(row => {
    try {
      const data = JSON.parse(row.data);
      return {
        id: row.id,
        data: { ...data, created_at: data.created_at || row.created_at }
      };
    } catch (e) {
      console.error('Error parsing course data:', e);
      return null;
    }
  }).filter(Boolean);
}

export function getCourseVideoIds(course) {
  const ids = [];
  for (const lesson of course?.lessons || []) {
    for (let index = 0; index < (lesson.videos || []).length; index += 1) {
      ids.push(`${lesson.id}-${index}`);
    }
  }
  return ids;
}

export function summarizeCourseProgress(course, stored = {}) {
  const ids = getCourseVideoIds(course);
  if (ids.length === 0) return { started: false, complete: false, percentage: 0 };

  const completed = stored?.completed || {};
  const progress = stored?.progress || {};
  let totalPercent = 0;
  let completedCount = 0;
  let started = false;

  for (const id of ids) {
    if (completed[id] === true) {
      completedCount += 1;
      totalPercent += 100;
      started = true;
      continue;
    }
    const value = Number(progress[id]);
    if (Number.isFinite(value) && value > 0) {
      started = true;
      totalPercent += Math.min(100, Math.max(0, value));
    }
  }

  return {
    started,
    complete: completedCount === ids.length,
    percentage: Math.round(totalPercent / ids.length)
  };
}
