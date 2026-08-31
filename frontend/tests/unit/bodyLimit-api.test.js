import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, toNodeListener, defineEventHandler, readBody } from 'h3';
import bodyLimit from '../../server/middleware/bodyLimit.js';

let server;
let baseUrl;

beforeAll(async () => {
  const app = createApp();
  app.use(bodyLimit);
  // Echo handler: proves the body survives the middleware (req.rawBody handoff)
  // and is still parseable downstream.
  app.use(defineEventHandler(async (event) => {
    if (event.node.req.method === 'GET') return { ok: true };
    const body = await readBody(event);
    return { got: body };
  }));
  server = createServer(toNodeListener(app));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('body limit middleware', () => {
  it('passes a normal JSON body through intact', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world', n: 7 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: { hello: 'world', n: 7 } });
  });

  it('rejects an oversized declared Content-Length with 413', async () => {
    const big = 'x'.repeat(300 * 1024); // > 256 KiB cap
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ big }),
    });
    expect(res.status).toBe(413);
  });

  it('leaves GET requests untouched', async () => {
    const res = await fetch(baseUrl, { method: 'GET' });
    expect(res.status).toBe(200);
  });
});
