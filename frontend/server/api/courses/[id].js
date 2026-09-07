import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireAuth } from '../../utils/authz';
export default defineEventHandler(event => {
  requireAuth(event);
  const course = getDb().prepare('SELECT data, available FROM courses WHERE id = ?').get(event.context.params.id);
  if (!course) throw createError({ statusCode: 404, statusMessage: 'Course not found. Rescan the library if it was recently added.' });
  if (!course.available) throw createError({ statusCode: 404, statusMessage: 'Course is unavailable. Its saved progress is retained.' });
  return JSON.parse(course.data);
});
