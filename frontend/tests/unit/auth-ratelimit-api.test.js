import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener } from 'h3';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../server/utils/db.js';
import { hashCredential } from '../../server/utils/credentials.js';
import { _resetForTests } from '../../server/utils/rate-limit.js';
import handler from '../../server/api/users/auth.js';

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

async function insertPinUser() {
  const id = uuidv4();
  createdIds.push(id);
  const pinHash = await hashCredential('1234');
  getDb().prepare(`
    INSERT INTO users (id, name, password, pin, isAdmin, is_active)
    VALUES (?, ?, NULL, ?, 0, 1)
  `).run(id, `pinuser-${id}`, pinHash);
  return id;
}

// Each attempt carries a DIFFERENT X-Forwarded-For, emulating the finding-#2
// bypass. With the fix, the derived IP comes from the transport peer (XFF is
// untrusted by default), so all attempts share one bucket and lock out.
async function wrongPin(userId, spoofIp) {
  return fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': spoofIp },
    body: JSON.stringify({ userId, pin: '0000' }),
  });
}

describe('auth rate limiting is not bypassable via X-Forwarded-For', () => {
  it('locks out after the threshold despite a fresh spoofed IP per request', async () => {
    _resetForTests();
    const userId = await insertPinUser();

    // Five wrong attempts, each with a distinct spoofed forwarded IP.
    for (let i = 0; i < 5; i++) {
      const res = await wrongPin(userId, `203.0.113.${i}`);
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(false);
    }

    // The sixth is locked out — the rotating header did not create new buckets.
    const sixth = await wrongPin(userId, '203.0.113.99');
    expect(sixth.status).toBe(429);
  });
});
