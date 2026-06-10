import { defineEventHandler } from 'h3';
import { requireAuth } from '../../utils/authz';

// GET /api/auth/me — returns the current user from the session, or 401
// (403 for deactivated accounts).
// Replaces the old "trust localStorage.userId" session-restore path.
export default defineEventHandler((event) => {
  const user = requireAuth(event);
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
