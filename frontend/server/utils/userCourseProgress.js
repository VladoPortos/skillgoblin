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
    SELECT id, data FROM courses
    WHERE id IN (${placeholders})
  `).all(courseIds);

  return rows.map(row => {
    try {
      return { id: row.id, data: JSON.parse(row.data) };
    } catch (e) {
      console.error('Error parsing course data:', e);
      return null;
    }
  }).filter(Boolean);
}
