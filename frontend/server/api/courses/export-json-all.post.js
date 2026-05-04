import fs from 'fs';
import path from 'path';
import { defineEventHandler } from 'h3';
import { getDb } from '../../utils/db';
import { getContentDir } from '../../utils/courseHelpers';
import { requireAdmin } from '../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const db = getDb();
  const rows = db
    .prepare('SELECT id, title, description, category, release_date, folder_name FROM courses')
    .all();

  const contentDir = getContentDir();
  const written = [];
  const failed = [];

  for (const row of rows) {
    if (!row.folder_name) {
      failed.push({ id: row.id, reason: 'no folder_name in DB' });
      continue;
    }
    const dir = path.join(contentDir, row.folder_name);
    if (!fs.existsSync(dir)) {
      failed.push({ id: row.id, reason: 'folder missing on disk' });
      continue;
    }

    const payload = {
      title: row.title || '',
      description: row.description || '',
      category: row.category || '',
      releaseDate: row.release_date || '',
    };

    try {
      fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
      written.push(row.id);
    } catch (err) {
      failed.push({ id: row.id, reason: err.message });
    }
  }

  return { success: failed.length === 0, written, failed };
});
