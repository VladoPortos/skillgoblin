import { addVideoIds } from '../utils/videoIdentity.js';

export default {
  name: '006_stable_progress',
  up(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS course_progress_revisions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, course_id)
    )`);
    const mappings = new Map();
    for (const row of db.prepare('SELECT id, data FROM courses').all()) {
      const original = JSON.parse(row.data);
      const course = addVideoIds(original);
      const map = new Map();
      for (const lesson of course.lessons) {
        lesson.videos.forEach((video, index) => map.set(`${lesson.id}-${index}`, video.id));
      }
      mappings.set(row.id, map);
      db.prepare('UPDATE courses SET data = ? WHERE id = ?').run(JSON.stringify(course), row.id);
    }
    // Run before the scanner reads disk: only the previous indexed tree knows
    // which file an existing positional key belonged to.
    for (const row of db.prepare('SELECT user_id, progress FROM user_progress').all()) {
      const progress = JSON.parse(row.progress || '{}');
      for (const [courseId, data] of Object.entries(progress)) {
        if (!data || typeof data !== 'object') continue;
        const map = mappings.get(courseId);
        if (!map) continue;
        for (const field of ['completed', 'progress']) {
          const values = data[field];
          if (!values || typeof values !== 'object') continue;
          for (const [oldId, id] of map) {
            if (Object.hasOwn(values, oldId)) {
              if (!Object.hasOwn(values, id)) values[id] = values[oldId];
              delete values[oldId];
            }
          }
        }
        if (data.lastViewed) {
          data.lastViewed.videoId = map.get(`${data.lastViewed.lessonId}-${data.lastViewed.videoIndex}`) || data.lastViewed.videoId;
        }
      }
      db.prepare('UPDATE user_progress SET progress = ? WHERE user_id = ?').run(JSON.stringify(progress), row.user_id);
    }
  }
};
