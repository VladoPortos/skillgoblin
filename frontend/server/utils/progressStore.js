import { createError } from 'h3';

export function readProgress(db, userId) {
  const row = db.prepare('SELECT progress FROM user_progress WHERE user_id = ?').get(userId);
  const revisions = Object.fromEntries(db.prepare('SELECT course_id, revision FROM course_progress_revisions WHERE user_id = ?').all(userId).map(r => [r.course_id, r.revision]));
  return { progress: row ? JSON.parse(row.progress || '{}') : {}, revisions };
}

function validateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw createError({statusCode:400,statusMessage:'Invalid progress data'});
  for (const field of ['completed', 'progress']) {
    if (data[field] === undefined) continue;
    if (!data[field] || typeof data[field] !== 'object' || Array.isArray(data[field])) throw createError({statusCode:400,statusMessage:'Invalid progress map'});
    for (const [key, value] of Object.entries(data[field])) {
      if (!key || key.length > 200 || ['__proto__','constructor','prototype'].includes(key) ||
        (field === 'completed' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) {
        throw createError({statusCode:400,statusMessage:'Invalid video progress'});
      }
    }
  }
  if (data.favorite !== undefined && typeof data.favorite !== 'boolean') throw createError({statusCode:400,statusMessage:'Invalid favorite value'});
}

export function writeProgress(db, userId, courseId, data, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw createError({statusCode:428,statusMessage:'Reload this course before saving progress'});
  if (typeof courseId !== 'string' || !courseId || ['__proto__','constructor','prototype'].includes(courseId)) throw createError({statusCode:400,statusMessage:'Invalid course ID'});
  validateData(data);
  return db.transaction(() => {
    if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) throw createError({statusCode:404,statusMessage:'User not found'});
    if (!db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId)) throw createError({statusCode:404,statusMessage:'Course not found'});
    const state = readProgress(db, userId);
    const currentRevision = state.revisions[courseId] || 0;
    if (currentRevision !== expectedRevision) throw createError({statusCode:409,statusMessage:'Progress changed on another device'});
    const clean = Object.fromEntries(['completed','progress','favorite','lastViewed'].filter(k => data[k] !== undefined).map(k => [k,data[k]]));
    state.progress[courseId] = clean;
    db.prepare(`INSERT INTO user_progress(user_id,progress,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET progress=excluded.progress,updated_at=CURRENT_TIMESTAMP`).run(userId,JSON.stringify(state.progress));
    const revision = currentRevision + 1;
    db.prepare(`INSERT INTO course_progress_revisions(user_id,course_id,revision) VALUES(?,?,?)
      ON CONFLICT(user_id,course_id) DO UPDATE SET revision=excluded.revision`).run(userId,courseId,revision);
    return { success:true, revision, data:clean };
  })();
}
