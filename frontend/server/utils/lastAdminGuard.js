// Single-purpose helper: refuse to leave the system without an *active* admin.
//
// Used by anything that demotes (isAdmin 1 → 0), deactivates (is_active 1 → 0),
// or deletes an admin account. "Last admin" here means "last admin who would
// still be active and admin after this change applies" — so deactivating the
// only active admin is also blocked, even though their isAdmin row stays at 1.
import { createError } from 'h3';

const ACTIVE_ADMINS_SQL = `SELECT COUNT(*) AS c FROM users WHERE isAdmin = 1 AND is_active = 1`;

function refuse(verb) {
  throw createError({
    statusCode: 409,
    statusMessage: `Refusing to ${verb} the last admin — promote or activate another user as admin first.`
  });
}

export function ensureNotLastAdmin(db, userId, action /* 'demote' | 'delete' | 'deactivate' */) {
  const target = db.prepare('SELECT isAdmin, is_active FROM users WHERE id = ?').get(userId);
  if (!target) return;

  // Only meaningful when the user is currently an active admin — anyone
  // else can be demoted/deactivated/deleted without affecting admin reach.
  if (!target.isAdmin || !target.is_active) return;

  const activeAdmins = db.prepare(ACTIVE_ADMINS_SQL).get().c;
  if (activeAdmins > 1) return;

  switch (action) {
    case 'delete':     refuse('delete');
    case 'deactivate': refuse('deactivate');
    case 'demote':     // fallthrough
    default:           refuse('demote');
  }
}
