import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, defineEventHandler, toNodeListener } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../server/utils/db.js';
import { hashCredential, verifyCredential } from '../../server/utils/credentials.js';
import handler, { runGuardedUserUpdate } from '../../server/api/users/index.js';

let server;
let baseUrl;
const createdIds = [];

beforeAll(async () => {
  const app = createApp();
  app.use(defineEventHandler((event) => {
    const id = event.node.req.headers['x-test-user'];
    if (!id) return;
    event.context.user = getDb()
      .prepare('SELECT id, name, avatar, isAdmin, is_active FROM users WHERE id = ?')
      .get(id);
    event.context.sessionToken = `test-session-${id}`;
  }));
  app.use(handler);
  server = createServer(toNodeListener(app));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  await new Promise((resolve) => server.close(resolve));
});

async function insertUser({ password = 'old-password', pin = null, isAdmin = 0 } = {}) {
  const id = uuidv4();
  createdIds.push(id);
  getDb().prepare(`
    INSERT INTO users (id, name, password, pin, isAdmin, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    id,
    `reauth-${id}`,
    password ? await hashCredential(password) : null,
    pin ? await hashCredential(pin) : null,
    isAdmin
  );
  return id;
}

async function updateAs(callerId, body) {
  return fetch(baseUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-test-user': callerId },
    body: JSON.stringify(body)
  });
}

describe('credential-change re-authentication', () => {
  it('rejects a self-service password change without the current credential', async () => {
    const id = await insertUser();
    const response = await updateAs(id, { id, name: `reauth-${id}`, password: 'new-password' });
    expect(response.status).toBe(401);
  });

  it('rejects an incorrect current credential and preserves the old password', async () => {
    const id = await insertUser();
    const response = await updateAs(id, {
      id,
      name: `reauth-${id}`,
      password: 'new-password',
      currentCredential: 'wrong-password'
    });
    expect(response.status).toBe(401);
    const stored = getDb().prepare('SELECT password FROM users WHERE id = ?').get(id).password;
    expect((await verifyCredential('old-password', stored)).ok).toBe(true);
  });

  it('accepts the current password before changing credentials', async () => {
    const id = await insertUser();
    const response = await updateAs(id, {
      id,
      name: `reauth-${id}`,
      password: 'new-password',
      currentCredential: 'old-password'
    });
    expect(response.status).toBe(200);
    const stored = getDb().prepare('SELECT password FROM users WHERE id = ?').get(id).password;
    expect((await verifyCredential('new-password', stored)).ok).toBe(true);
  });

  it('accepts the current PIN as proof before adding a password', async () => {
    const id = await insertUser({ password: null, pin: '1234' });
    const response = await updateAs(id, {
      id,
      name: `reauth-${id}`,
      password: 'new-password',
      currentCredential: '1234'
    });
    expect(response.status).toBe(200);
  });

  it('does not require the target credential for an administrator reset', async () => {
    const adminId = await insertUser({ isAdmin: 1 });
    const targetId = await insertUser();
    const response = await updateAs(adminId, {
      id: targetId,
      name: `reauth-${targetId}`,
      password: 'admin-reset-password'
    });
    expect(response.status).toBe(200);
  });

  it('does not require re-authentication for profile-only changes', async () => {
    const id = await insertUser();
    const response = await updateAs(id, { id, name: `renamed-${id}` });
    expect(response.status).toBe(200);
  });

  it('does not overwrite a concurrent administrator credential reset', async () => {
    const id = await insertUser();
    const db = getDb();
    const verifiedSnapshot = db.prepare('SELECT password, pin FROM users WHERE id = ?').get(id);
    const adminResetHash = await hashCredential('admin-reset-password');
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(adminResetHash, id);

    const selfChosenHash = await hashCredential('attacker-chosen-password');
    const result = runGuardedUserUpdate(
      db,
      ['password = ?'],
      [selfChosenHash],
      id,
      verifiedSnapshot
    );

    expect(result.changes).toBe(0);
    const stored = db.prepare('SELECT password FROM users WHERE id = ?').get(id).password;
    expect((await verifyCredential('admin-reset-password', stored)).ok).toBe(true);
  });
});
