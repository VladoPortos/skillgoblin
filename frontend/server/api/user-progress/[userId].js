import { defineEventHandler, readBody, getMethod, getQuery, createError } from 'h3';
import { getDb } from '../../utils/db';
import { requireSelfOrAdmin } from '../../utils/authz';
import { readProgress, writeProgress } from '../../utils/progressStore.js';

// Unavailable content never deletes or hides a user's saved history.
export default defineEventHandler(async event => {
  const userId = event.context.params.userId;
  requireSelfOrAdmin(event,userId);
  const db = getDb();
  if (getMethod(event) === 'GET') {
    const state = readProgress(db,userId);
    const filter = getQuery(event).courseIds;
    if (filter !== undefined) {
      let ids;
      try { ids = JSON.parse(filter); } catch { throw createError({statusCode:400,statusMessage:'Invalid course filter'}); }
      if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) throw createError({statusCode:400,statusMessage:'Invalid course filter'});
      const selected = new Set(ids);
      state.progress = Object.fromEntries(Object.entries(state.progress).filter(([id])=>selected.has(id)));
      state.revisions = Object.fromEntries(Object.entries(state.revisions).filter(([id])=>selected.has(id)));
    }
    return state;
  }
  if (getMethod(event) === 'POST') {
    const body = await readBody(event) || {};
    return writeProgress(db,userId,body.courseId,body.data,body.revision);
  }
  throw createError({statusCode:405,statusMessage:'Method not allowed'});
});
