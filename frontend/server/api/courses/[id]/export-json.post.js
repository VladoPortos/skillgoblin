import fs from 'fs';
import path from 'path';
import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getContentDir } from '../../../utils/courseHelpers';
import { requireAdmin } from '../../../utils/authz';

// Build the JSON object that gets written to disk. Limited to the four
// fields documented in the spec — id, lessons, thumbnail are *not* exported
// because they are derived from folder structure and the thumbnail.png
// convention.
function buildPayload(row) {
  return {
    title: row.title || '',
    description: row.description || '',
    category: row.category || '',
    releaseDate: row.release_date || '',
  };
}

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT title, description, category, release_date, folder_name FROM courses WHERE id = ?')
    .get(courseId);
  if (!row || !row.folder_name) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' });
  }

  const courseDir = path.join(getContentDir(), row.folder_name);
  if (!fs.existsSync(courseDir)) {
    throw createError({ statusCode: 404, statusMessage: 'Course folder missing' });
  }

  const payload = buildPayload(row);
  const filePath = path.join(courseDir, 'course.json');
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  return { success: true, path: filePath, fields: payload };
});
