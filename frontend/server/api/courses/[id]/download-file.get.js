import fs from 'fs';
import path from 'path';
import { getDb } from '../../../utils/db';
import { resolveCourseDir, resolvePathInCourse } from '../../../utils/courseHelpers';
import { requireAuth } from '../../../utils/authz';
import { sendStream } from 'h3';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const courseId = event.context.params.id;
  const query = getQuery(event);
  const filePathRelative = query.filePath;

  if (!courseId || !filePathRelative) {
    throw createError({ statusCode: 400, statusMessage: 'Course ID and file path are required.' });
  }

  const db = getDb();
  const course = db.prepare('SELECT folder_name FROM courses WHERE id = ?').get(courseId);

  if (!course || !course.folder_name) {
    throw createError({ statusCode: 404, statusMessage: 'Course or course folder not found.' });
  }

  let courseBasePath;
  try {
    courseBasePath = resolveCourseDir(course.folder_name);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid course folder' });
  }

  let absoluteFilePath;
  try {
    absoluteFilePath = resolvePathInCourse(courseBasePath, filePathRelative);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid file path' });
  }

  if (!fs.existsSync(absoluteFilePath)) {
    throw createError({ statusCode: 404, statusMessage: 'File not found.' });
  }

  const stat = fs.statSync(absoluteFilePath);
  if (!stat.isFile()) {
    throw createError({ statusCode: 400, statusMessage: 'Not a file' });
  }

  const fileName = path.basename(absoluteFilePath);

  event.node.res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  // MIME type can be set more dynamically if needed, for now, octet-stream is generic
  event.node.res.setHeader('Content-Type', 'application/octet-stream');

  return sendStream(event, fs.createReadStream(absoluteFilePath));
});
