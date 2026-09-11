import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener } from 'h3';
import { getDb } from '../../server/utils/db.js';
import { _resetForTests } from '../../server/utils/rate-limit.js';
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

beforeEach(() => {
  _resetForTests();
  const db = getDb();
  db.prepare("UPDATE system_settings SET value = 'true' WHERE key = 'allow_user_registration'").run();
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  await new Promise((resolve) => server.close(resolve));
});

async function register(name) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, password: 'test-password' })
  });
  if (response.status === 200) {
    const user = await response.json();
    if (user.id) createdIds.push(user.id);
  }
  return response;
}

describe('anonymous registration request limiting', () => {
  it('caps account creation per client address before more Argon2 work', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await register(`rate-limit-registration-${Date.now()}-${i}`)).status).toBe(200);
    }

    const blocked = await register(`rate-limit-registration-${Date.now()}-blocked`);
    expect(blocked.status).toBe(429);
  });
});
