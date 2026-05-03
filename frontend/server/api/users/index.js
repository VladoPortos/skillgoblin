import { getDb } from '../../utils/db';
import { v4 as uuidv4 } from 'uuid';
import { defineEventHandler, readBody, createError } from 'h3';
import { hashCredential } from '../../utils/credentials';

// /api/users
//   GET  — list users for the login screen.
//   POST — create a new account. Phase 1 hardening: requires at least one
//          credential, hashes it on insert, refuses to take `isAdmin` from
//          the body, and honors the system_settings.auto_approve_new_users
//          flag for is_active.
//   PUT  — update a user. Phase 1 still leaves authorization weak (no
//          session check yet — that lands in Phase 2). For now we hash any
//          credential the body supplies and refuse to mutate is_active /
//          isAdmin via this endpoint, which closes the worst of the
//          self-promotion holes until the session middleware is in place.
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

      // Strict-mode (default): new accounts land inactive until an admin
      // approves them. Loose-mode: auto_approve_new_users=true → active.
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
      `).run(
        userId,
        name,
        avatar,
        hashedPassword,
        hashedPin,
        'dark',
        0,           // isAdmin: never trust the body — admin promotion has its own path in Phase 2
        isActive
      );

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

      const db = getDb();
      const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(body.id);
      if (!userExists) {
        return createError({ statusCode: 404, statusMessage: 'User not found' });
      }

      const avatar = typeof body.avatar === 'string' ? body.avatar : null;
      const fields = ['name = ?', 'avatar = ?'];
      const params = [body.name.trim(), avatar];

      // Credential changes are hashed before storage.
      if (body.password !== undefined) {
        const v = typeof body.password === 'string' && body.password.length > 0 ? body.password : null;
        fields.push('password = ?');
        params.push(v ? await hashCredential(v) : null);
      }
      if (body.pin !== undefined) {
        const v = typeof body.pin === 'string' && body.pin.length > 0 ? body.pin : null;
        fields.push('pin = ?');
        params.push(v ? await hashCredential(v) : null);
      }

      // NOTE: This endpoint intentionally does NOT honor `isAdmin` or
      // `is_active` from the body. Without a session, we have no way to
      // tell who's calling — accepting those fields would let any caller
      // promote themselves to admin or self-activate (and that's exactly
      // the bug we're fixing in this round). Admin role / activation
      // changes get their own session-gated endpoints in Phase 2.

      params.push(body.id);
      const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
      const result = stmt.run(...params);

      if (result.changes !== 1) {
        return createError({ statusCode: 404, statusMessage: 'User not found or no changes made' });
      }

      const updatedUser = db.prepare(`
        SELECT id, name, avatar, isAdmin, is_active,
               CASE WHEN password IS NOT NULL THEN 1 ELSE 0 END AS has_password,
               CASE WHEN pin      IS NOT NULL THEN 1 ELSE 0 END AS has_pin
        FROM users WHERE id = ?
      `).get(body.id);
      return updatedUser;
    } catch (error) {
      console.error('Error updating user:', error);
      return createError({
        statusCode: 500,
        statusMessage: 'Failed to update user: ' + error.message
      });
    }
  }

  return createError({ statusCode: 405, statusMessage: 'Method Not Allowed' });
});
