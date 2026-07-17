import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../server/utils/db.js';
import handler from '../../server/api/users/index.js';

let server;
let baseUrl;
const createdIds = [];

beforeAll(async () => {
  const app = createApp();
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

function insertUser() {
  const id = uuidv4();
  createdIds.push(id);
  // Has a password + pin so the flags would be 1 if they were exposed.
  getDb().prepare(`
    INSERT INTO users (id, name, avatar, password, pin, isAdmin, is_active)
    VALUES (?, ?, 'x', 'hash', 'hash', 1, 1)
  `).run(id, `listuser-${id}`);
  return id;
}

describe('GET /api/users (unauthenticated list)', () => {
  it('hides credential-presence flags but keeps isAdmin for the picker', async () => {
    const id = insertUser();
    const res = await fetch(baseUrl, { method: 'GET' });
    expect(res.status).toBe(200);
    const list = await res.json();
    const row = list.find((u) => u.id === id);
    expect(row).toBeTruthy();
    // Picker needs these:
    expect(row.name).toContain('listuser-');
    expect(row.isAdmin).toBe(1);
    // Recon surface — must NOT be handed to anonymous callers in bulk:
    expect(row).not.toHaveProperty('has_password');
    expect(row).not.toHaveProperty('has_pin');
  });
});
