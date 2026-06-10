import { defineEventHandler, createError } from 'h3';
import { getDb } from '../../../utils/db';
import { resolveCourseById } from '../../../utils/courseHelpers';
import { hasCourseJson } from '../../../utils/courseJsonOverride.js';
import { requireAdmin } from '../../../utils/authz';

export default defineEventHandler((event) => {
  requireAdmin(event);
  const courseId = event.context.params.id;
  if (!courseId) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID is required.' });
  }

  const db = getDb();
  const { courseDir } = resolveCourseById(db, courseId);
  return { hasJson: hasCourseJson(courseDir) };
});
