import fs from 'fs';
import path from 'path';
import { getDb } from '../../../utils/db';
import { getContentDir } from '../../../utils/courseHelpers';
import { sendStream } from 'h3';

export default defineEventHandler(async (event) => {
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

  const contentDir = getContentDir();
  const courseBasePath = path.join(contentDir, course.folder_name);
  
  const absoluteFilePath = path.normalize(path.join(courseBasePath, filePathRelative));

  if (!absoluteFilePath.startsWith(courseBasePath)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Access to this path is not allowed.' });
  }

  if (!fs.existsSync(absoluteFilePath) || !fs.statSync(absoluteFilePath).isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'File not found.' });
  }

  const fileName = path.basename(absoluteFilePath);
  
  event.node.res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  // MIME type can be set more dynamically if needed, for now, octet-stream is generic
  event.node.res.setHeader('Content-Type', 'application/octet-stream'); 

  return sendStream(event, fs.createReadStream(absoluteFilePath));
});
