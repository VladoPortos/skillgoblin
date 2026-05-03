import { createError } from 'h3';

// Authorization helpers used by request handlers. They read `event.context.user`,
// which is populated by the session middleware (frontend/server/middleware/session.js)
// when a valid session cookie is presented.
//
// All three throw an h3 error on failure so handlers can remain a single
// straight-line function.

export function requireAuth(event) {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
  }
  if (!user.is_active) {
    throw createError({ statusCode: 403, statusMessage: 'This account is not active' });
  }
  return user;
}

export function requireAdmin(event) {
  const user = requireAuth(event);
  if (!user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin privilege required' });
  }
  return user;
}

// Either the caller is acting on themselves, or they're an admin acting on
// someone else. Returns the caller's user object so handlers can branch on
// `caller.isAdmin` if the response shape differs.
export function requireSelfOrAdmin(event, targetUserId) {
  const user = requireAuth(event);
  if (user.id === targetUserId) return user;
  if (user.isAdmin) return user;
  throw createError({ statusCode: 403, statusMessage: 'Not allowed to act on another user' });
}
