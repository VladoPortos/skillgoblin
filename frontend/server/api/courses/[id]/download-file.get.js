import fs from 'fs';
import path from 'path';
import { getDb } from '../../../utils/db';
import { resolveCourseById, resolvePathInCourse } from '../../../utils/courseHelpers';
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
  const { courseDir: courseBasePath } = resolveCourseById(db, courseId, {
    notFoundMessage: 'Course or course folder not found.'
  });

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
