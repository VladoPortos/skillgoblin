import { defineEventHandler, getQuery } from 'h3';
import { getDb } from '../utils/db';
import { queryCourseCatalog } from '../utils/courseCatalog.js';
import { parseNewBadgeDays, isWithinNewWindow } from '../utils/recencyHelpers.js';
import { requireAuth } from '../utils/authz.js';
export default defineEventHandler(event => {
  requireAuth(event);
  const query = getQuery(event);
  const result = queryCourseCatalog(getDb(), {
    sort: query.sort === 'newest' ? 'newest' : 'title',
    category: typeof query.category === 'string' ? query.category : '',
    search: typeof query.search === 'string' ? query.search : '',
    page: Math.min(Math.max(parseInt(query.page) || 1, 1), 1000000),
    limit: Math.min(Math.max(parseInt(query.limit) || 9, 1), 100)
  });
  const days = parseNewBadgeDays(process.env.NEW_BADGE_DAYS);
  for (const course of result.items) course.isNew = isWithinNewWindow(course.created_at, days, Date.now());
  return result;
});
