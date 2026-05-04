import path from 'path';
import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { getContentDir } from '../../../utils/courseHelpers';
import { hasCourseJson } from '../../../utils/courseJsonOverride.js';
import { requireAdmin } from '../../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const row = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);
  if (!row || !row.folder_name) {
    throw createError({ statusCode: 404, statusMessage: 'Course not found' });
  }

  const courseDir = path.join(getContentDir(), row.folder_name);
  return { hasJson: hasCourseJson(courseDir) };
});
