// Adds a `system_settings.allow_user_registration` toggle. When 'false',
// public POST /api/users is gated to admin-session callers; the login screen
// hides the "New User" tile.
//
// First-boot seeding: respect process.env.ALLOW_USER_REGISTRATION when it is
// exactly 'true' or 'false'. Anything else (including unset, empty, garbage)
// defaults to 'true' so existing installs upgrade with no behavior change.
//
// Idempotent: INSERT OR IGNORE leaves an admin-edited value alone on re-runs.
export default {
  name: '003_allow_user_registration',
  up(db) {
    const raw = process.env.ALLOW_USER_REGISTRATION;
    const value = raw === 'true' || raw === 'false' ? raw : 'true';
    db.prepare(
      `INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`
    ).run('allow_user_registration', value);
  }
};
