import fs from 'fs';
import path from 'path';
import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { resolveCourseById } from '../../../utils/courseHelpers';
import { buildCourseJsonPayload } from '../../../utils/courseJsonOverride.js';
import { requireAdmin } from '../../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const { courseDir } = resolveCourseById(db, courseId);
  const row = db
    .prepare('SELECT title, description, category, release_date FROM courses WHERE id = ?')
    .get(courseId);
  if (!fs.existsSync(courseDir)) {
    throw createError({ statusCode: 404, statusMessage: 'Course folder missing' });
  }

  const payload = buildCourseJsonPayload(row);
  const filePath = path.join(courseDir, 'course.json');
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  return { success: true, path: 'course.json', fields: payload };
});
