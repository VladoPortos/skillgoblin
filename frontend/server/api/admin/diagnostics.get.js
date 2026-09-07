import fs from 'node:fs';
import { defineEventHandler, getQuery, createError } from 'h3';
import { requireAdmin } from '../../utils/authz.js';
import { getDb } from '../../utils/db.js';
import { getContentDir } from '../../utils/courseHelpers.js';
import { initialScanStatus } from '../../utils/courseWatcher.js';
import { getScanErrors } from '../../utils/scanDiagnostics.js';
import { diagnoseCourse } from '../../utils/mediaDiagnostics.js';

let probing = false;
export default defineEventHandler(async event => {
  requireAdmin(event);
  const db = getDb();
  const query = getQuery(event);
  if (query.courseId) {
    if (probing) throw createError({ statusCode: 429, statusMessage: 'Another media probe is running. Try again shortly.' });
    const course = db.prepare('SELECT id, folder_name, data FROM courses WHERE id = ?').get(String(query.courseId));
    if (!course) throw createError({ statusCode: 404, statusMessage: 'Course not found' });
    probing = true;
    try { return await diagnoseCourse(course, Math.max(0, parseInt(query.videoIndex) || 0)); }
    finally { probing = false; }
  }
  return {
    configuration: { contentDirectory: getContentDir(), contentExists: fs.existsSync(getContentDir()), databasePath: db.name, watcherIntervalMs: parseInt(process.env.CHOKIDAR_POLLING_INTERVAL || '60000', 10), mediaProbeTimeoutMs: 10000 },
    scan: { ...initialScanStatus }, errors: getScanErrors(),
    counts: db.prepare('SELECT count(*) AS total, coalesce(sum(available = 0), 0) AS unavailable FROM courses').get(),
    courses: db.prepare('SELECT id, title, available, video_count AS videoCount FROM courses ORDER BY available ASC, title LIMIT 100').all()
  };
});
