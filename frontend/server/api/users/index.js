import { defineEventHandler, readBody, createError } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../utils/db';
import { hashCredential } from '../../utils/credentials';
import { requireAdmin, requireSelfOrAdmin } from '../../utils/authz';
import { deleteUserSessions } from '../../utils/sessions';
import { ensureNotLastAdmin } from '../../utils/lastAdminGuard';

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
        SELECT id, name, avatar, isAdmin, is_active,
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

      const db = getDb();
      const existingUser = db.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').get(name);
      if (existingUser) {
        return createError({
          statusCode: 409,
          statusMessage: 'A user with this name already exists'
        });
      }

      const autoApproveRow = db
        .prepare("SELECT value FROM system_settings WHERE key = 'auto_approve_new_users'")
        .get();
      const autoApprove = (autoApproveRow?.value ?? 'false') === 'true';
      const isActive = autoApprove ? 1 : 0;

      const userId = uuidv4();
      const hashedPassword = password ? await hashCredential(password) : null;
      const hashedPin = pin ? await hashCredential(pin) : null;

      const result = db.prepare(`
        INSERT INTO users (id, name, avatar, password, pin, theme, isAdmin, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, name, avatar, hashedPassword, hashedPin, 'dark', 0, isActive);

      if (result.changes !== 1) {
        return createError({ statusCode: 500, statusMessage: 'Failed to create user' });
      }

      const newUser = db.prepare(`
        SELECT id, name, avatar, isAdmin, is_active,
               CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL THEN 1 ELSE 0 END AS has_pin
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

      const avatar = typeof body.avatar === 'string' ? body.avatar : null;
      const fields = ['name = ?', 'avatar = ?'];
      const params = [body.name.trim(), avatar];

      let credentialsChanged = false;
      if (body.password !== undefined) {
        const v = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;
        fields.push('password = ?');
        params.push(v ? await hashCredential(v) : null);
        credentialsChanged = true;
      }
      if (body.pin !== undefined) {
        const v = typeof body.pin === 'string' && body.pin.length > 0 ? body.pin : null;
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
               CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL THEN 1 ELSE 0 END AS has_pin
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
