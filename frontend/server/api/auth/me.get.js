import { defineEventHandler, createError } from 'h3';

// GET /api/auth/me — returns the current user from the session, or 401.
// Replaces the old "trust localStorage.userId" session-restore path.
export default defineEventHandler((event) => {
  const user = event.context.user;
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' });
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      isAdmin: user.isAdmin,
      is_active: user.is_active
    }
  };
});
