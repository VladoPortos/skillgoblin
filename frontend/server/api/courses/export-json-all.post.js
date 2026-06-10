import fs from 'fs';
import path from 'path';
import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { resolveCourseDir } from '../../utils/courseHelpers';
import { buildCourseJsonPayload } from '../../utils/courseJsonOverride.js';
import { requireAdmin } from '../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const db = getDb();
  const rows = db
    .prepare('SELECT id, title, description, category, release_date, folder_name FROM courses')
    .all();

  const written = [];
  const failed = [];

  for (const row of rows) {
    if (!row.folder_name) {
      failed.push({ id: row.id, reason: 'no folder_name in DB' });
      continue;
    }
    let dir;
    try {
      dir = resolveCourseDir(row.folder_name);
    } catch {
      failed.push({ id: row.id, reason: 'invalid folder_name in DB' });
      continue;
    }
    if (!fs.existsSync(dir)) {
      failed.push({ id: row.id, reason: 'folder missing on disk' });
      continue;
    }

    const payload = buildCourseJsonPayload(row);

    try {
      fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      written.push(row.id);
    } catch (err) {
      console.error(`[export-json-all] write failed for ${row.id}:`, err);
      failed.push({ id: row.id, reason: 'write failed' });
    }
  }

  return { success: failed.length === 0, written, failed };
});
