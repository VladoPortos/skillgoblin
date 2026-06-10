import { defineEventHandler, readBody, createError } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { requireSelfOrAdmin } from '../../utils/authz';
import { deleteUserSessions } from '../../utils/sessions';
import { ensureNotLastAdmin } from '../../utils/lastAdminGuard';
import { getBoolSetting } from '../../utils/systemSettings';

// /api/users
//   GET  — list users for the login screen. Public.
//   POST — create a new account. Public so the signup screen works; the
//          new account is `is_active = 0` unless system_settings.auto_approve_new_users
//          is true. Hashes credentials, refuses body.isAdmin.
//   PUT  — update a user. Requires a session. Caller must be acting on
//          themselves OR be an admin. Only admins can mutate isAdmin /
//          is_active. Last-admin-protected on demotion. Credential changes
//          revoke other sessions for that user.
export default defineEventHandler(async (event) => {
  const method = event.node.req.method;

  if (method === 'GET') {
    try {
      const db = getDb();
      const users = db.prepare(`
        SELECT id, name, avatar, isAdmin, is_active, created_at,
               CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL AND pin      != '' THEN 1 ELSE 0 END AS has_pin
        FROM users
        ORDER BY created_at DESC
      `).all();
      return users || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      return createError({ statusCode: 500, statusMessage: 'Failed to fetch users' });
    }
  }

  if (method === 'POST') {
    try {
      const db = getDb();

      // Registration gate. Read the setting and the caller's session up
      // front. We do NOT use requireAuth() here because we want to allow
      // the anonymous signup path through when the setting is true; we
      // also do not want a deactivated session-cookie holder to be
      // treated the same as an anonymous caller.
      const allowRegistration = getBoolSetting(db, 'allow_user_registration', true);

      const sessionUser = event.context.user || null;
      const isAdminCaller = !!(sessionUser && sessionUser.is_active && sessionUser.isAdmin);

      if (!allowRegistration && !isAdminCaller) {
        return createError({
          statusCode: 403,
          statusMessage: 'Registration is disabled on this instance'
        });
      }

      const body = await readBody(event) || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';

      if (!name) {
        return createError({ statusCode: 400, statusMessage: 'Username is required' });
      }

      const password = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;
      const pin = typeof body.pin === 'string' && body.pin.length > 0 ? body.pin : null;
      const avatar = typeof body.avatar === 'string' ? body.avatar : null;

      if (!password && !pin) {
        return createError({
          statusCode: 400,
          statusMessage: 'A password or PIN is required to create an account'
        });
      }

      // PINs are exactly 4 digits — the login UI's split-input field can't
      // produce anything else, so accepting `abc` server-side would silently
      // lock out the user (admin-set PINs in particular).
      if (pin !== null && !/^\d{4}$/.test(pin)) {
        return createError({
          statusCode: 400,
          statusMessage: 'PIN must be exactly 4 digits'
        });
      }

      const allowPin = getBoolSetting(db, 'allow_pin', true);

      // When PINs are globally disabled, a PIN-only signup must be refused
      // (the user would not be able to log in without a password). A signup
      // that supplies both is fine — we just drop the PIN.
      if (!allowPin && !password) {
        return createError({
          statusCode: 400,
          statusMessage: 'PINs are disabled on this instance — set a password.'
        });
      }
      const effectivePin = allowPin ? pin : null;

      const existingUser = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(name);
      if (existingUser) {
        return createError({
          statusCode: 409,
          statusMessage: 'A user with this name already exists'
        });
      }

      // Admin-create is an explicit, knowing action — it bypasses the
      // global auto-approve setting and lands the user as is_active=1.
      // Anonymous self-signup honors the setting as before.
      let isActive;
      if (isAdminCaller) {
        isActive = 1;
      } else {
        isActive = getBoolSetting(db, 'auto_approve_new_users', false) ? 1 : 0;
      }

      const userId = uuidv4();
      const hashedPassword = password ? await hashCredential(password) : null;
      const hashedPin = effectivePin ? await hashCredential(effectivePin) : null;

      const result = db.prepare(`
        INSERT INTO users (id, name, avatar, password, pin, theme, isAdmin, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, name, avatar, hashedPassword, hashedPin, 'dark', 0, isActive);

      if (result.changes !== 1) {
        return createError({ statusCode: 500, statusMessage: 'Failed to create user' });
      }

      const newUser = db.prepare(`
        SELECT id, name, avatar, isAdmin, is_active,
               CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL AND pin      != '' THEN 1 ELSE 0 END AS has_pin
        FROM users WHERE id = ?
      `).get(userId);
      return newUser;
    } catch (error) {
      console.error('Error creating user:', error);
      return createError({ statusCode: 500, statusMessage: 'Failed to create user' });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await readBody(event) || {};

      if (!body.id) {
        return createError({ statusCode: 400, statusMessage: 'User ID is required' });
      }
      if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
        return createError({ statusCode: 400, statusMessage: 'Name is required' });
      }

      const caller = requireSelfOrAdmin(event, body.id);
      const isAdminCaller = !!caller.isAdmin;
      const isSelfEdit = caller.id === body.id;

      const db = getDb();
      const target = db.prepare('SELECT id, isAdmin, is_active FROM users WHERE id = ?').get(body.id);
      if (!target) {
        return createError({ statusCode: 404, statusMessage: 'User not found' });
      }

      // Mirror the POST duplicate check — renaming to another user's name
      // (case-insensitively) is refused.
      const duplicate = db
        .prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?')
        .get(body.name.trim(), body.id);
      if (duplicate) {
        return createError({
          statusCode: 409,
          statusMessage: 'A user with this name already exists'
        });
      }

      // Build the field list incrementally. Untouched fields stay as-is in
      // the DB so partial updates (e.g., admin-panel "activate" sending only
      // { id, name, is_active }) don't accidentally clobber unrelated columns
      // like the user's avatar. Same "if undefined → leave alone" pattern
      // already used below for password/pin.
      const fields = ['name = ?'];
      const params = [body.name.trim()];

      if (body.avatar !== undefined) {
        const avatar = typeof body.avatar === 'string' ? body.avatar : null;
        fields.push('avatar = ?');
        params.push(avatar);
      }

      // Decide what the post-update credential state will be. Refuse the
      // update if it would leave the row with neither password nor PIN —
      // the new auth model requires at least one. We only consult the DB
      // for the fields the body did NOT touch.
      const allowPin = getBoolSetting(db, 'allow_pin', true);

      const passwordTouched = body.password !== undefined;
      const pinTouched = body.pin !== undefined;
      const passwordWillBeSet = passwordTouched
        ? (typeof body.password === 'string' && body.password.length > 0)
        : null; // null = "unchanged, fall back to DB"

      // Same 4-digit constraint as POST — applies whether self-edit or
      // admin-reset. Empty/null is allowed (means "clear PIN" subject to
      // credential-floor check below).
      if (pinTouched && body.pin !== null && body.pin !== '' && !/^\d{4}$/.test(body.pin)) {
        return createError({
          statusCode: 400,
          statusMessage: 'PIN must be exactly 4 digits'
        });
      }
      // When PINs are globally disabled, refuse explicit PIN sets but
      // leave any existing PIN alone for unrelated profile updates. The
      // login path already rejects PIN auth under allow_pin=false (see
      // /api/users/auth.js), so a stale PIN row is harmless. Clearing it
      // silently on every PUT was surprising — operators who toggle the
      // setting back ON would lose users' PINs in the meantime.
      if (!allowPin && pinTouched && typeof body.pin === 'string' && body.pin.length > 0) {
        return createError({
          statusCode: 400,
          statusMessage: 'PINs are disabled on this instance — cannot set a PIN.'
        });
      }
      const pinWillBeSet = pinTouched
        ? (typeof body.pin === 'string' && body.pin.length > 0)
        : null;

      if (passwordTouched || pinTouched) {
        const current = db.prepare(`
          SELECT
            CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
            CASE WHEN pin      IS NOT NULL AND pin      != '' THEN 1 ELSE 0 END AS has_pin
          FROM users WHERE id = ?
        `).get(body.id);
        const finalHasPassword = passwordWillBeSet ?? current.has_password === 1;
        const finalHasPin      = pinWillBeSet      ?? current.has_pin      === 1;
        if (!finalHasPassword && !finalHasPin) {
          throw createError({
            statusCode: 400,
            statusMessage: 'A password or PIN is required — refusing to leave this account with no credentials.'
          });
        }
      }

      let credentialsChanged = false;
      if (passwordTouched) {
        const v = passwordWillBeSet ? body.password : null;
        fields.push('password = ?');
        params.push(v ? await hashCredential(v) : null);
        credentialsChanged = true;
      }
      if (pinTouched) {
        // null / empty body.pin means "clear PIN" (subject to credential
        // floor above). Otherwise hash and store. Setting a PIN under
        // allow_pin=false was already refused above.
        const v = pinWillBeSet ? body.pin : null;
        fields.push('pin = ?');
        params.push(v ? await hashCredential(v) : null);
        credentialsChanged = true;
      }

      // Role and activation changes: admin-only. Self-edit cannot promote
      // self. Last-admin-protected on demotion.
      let isAdminChange = null;
      let isActiveChange = null;
      if (body.isAdmin !== undefined) {
        if (!isAdminCaller) {
          return createError({ statusCode: 403, statusMessage: 'Only admins can change roles' });
        }
        isAdminChange = body.isAdmin ? 1 : 0;
      }
      if (body.is_active !== undefined) {
        if (!isAdminCaller) {
          return createError({ statusCode: 403, statusMessage: 'Only admins can change activation' });
        }
        isActiveChange = body.is_active ? 1 : 0;
      }

      // Block any change that would leave the system with zero active admins.
      // Three trigger conditions: demote, deactivate, or both at once.
      if (isAdminChange === 0 && target.isAdmin === 1) {
        ensureNotLastAdmin(db, target.id, 'demote');
      }
      if (isActiveChange === 0 && target.isAdmin === 1 && target.is_active === 1) {
        ensureNotLastAdmin(db, target.id, 'deactivate');
      }

      if (isAdminChange !== null) {
        fields.push('isAdmin = ?');
        params.push(isAdminChange);
      }
      if (isActiveChange !== null) {
        fields.push('is_active = ?');
        params.push(isActiveChange);
      }

      params.push(body.id);
      const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
      const result = stmt.run(...params);

      if (result.changes !== 1) {
        return createError({ statusCode: 404, statusMessage: 'User not found or no changes made' });
      }

      // If credentials changed, invalidate every other session for the
      // affected user. Keep the caller's own session alive so a self-edit
      // doesn't immediately log them out.
      if (credentialsChanged) {
        const exceptToken = isSelfEdit ? event.context.sessionToken : null;
        deleteUserSessions(db, body.id, { exceptToken });
      }

      const updatedUser = db.prepare(`
        SELECT id, name, avatar, isAdmin, is_active,
               CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL AND pin      != '' THEN 1 ELSE 0 END AS has_pin
        FROM users WHERE id = ?
      `).get(body.id);
      return updatedUser;
    } catch (error) {
      // requireSelfOrAdmin / ensureNotLastAdmin throw h3 errors that we let
      // propagate as-is. Anything else gets a generic 500.
      if (error?.statusCode) throw error;
      console.error('Error updating user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to update user: ' + error.message
      });
    }
  }

  return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
