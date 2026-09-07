import { defineEventHandler } from 'h3';
import { getDb } from '../utils/db';
import { requireAuth } from '../utils/authz.js';
export default defineEventHandler(event => {
  requireAuth(event);
  return getDb().prepare("SELECT DISTINCT category FROM courses WHERE available = 1 AND trim(coalesce(category, '')) <> '' ORDER BY category").all().map(row => row.category);
});
