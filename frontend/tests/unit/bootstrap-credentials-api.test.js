import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../server/utils/db.js';
import handler from '../../server/api/users/bootstrap-credentials.post.js';

let server;
let baseUrl;
const createdIds = [];

beforeAll(async () => {
  const app = createApp();
  app.use(handler);
  server = createServer(toNodeListener(app));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  await new Promise(resolve => server.close(resolve));
});

function insertLegacyUser({ active }) {
  const id = uuidv4();
  createdIds.push(id);
  getDb().prepare(`
    INSERT INTO users (id, name, password, pin, isAdmin, is_active)
    VALUES (?, ?, NULL, NULL, 0, ?)
  `).run(id, `legacy-${id}`, active ? 1 : 0);
  return id;
}

async function claim(userId, password = 'claimed-password') {
  return fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
}

describe('legacy credential first claim', () => {
  it('lets an active credential-less user claim once and receive a session', async () => {
    const userId = insertLegacyUser({ active: true });
    const first = await claim(userId);
    expect(first.status).toBe(200);
    expect(first.headers.get('set-cookie')).toContain('sg_session=');
    expect((await first.json()).success).toBe(true);

    const second = await claim(userId, 'different-password');
    expect(second.status).toBe(409);
  });

  it('refuses an inactive credential-less user', async () => {
    const userId = insertLegacyUser({ active: false });
    expect((await claim(userId)).status).toBe(403);
  });
});
