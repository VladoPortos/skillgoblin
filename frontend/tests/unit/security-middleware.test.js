import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createApp, defineEventHandler, toNodeListener } from 'h3';

let server;
let baseUrl;

beforeAll(async () => {
  const { default: security } = await import('../../server/middleware/security.js');
  const app = createApp();
  app.use(security);
  app.use(defineEventHandler(() => ({ ok: true })));
  server = createServer(toNodeListener(app));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('request security middleware', () => {
  it('is available as a Nitro event handler', async () => {
    const module = await import('../../server/middleware/security.js').catch(() => ({}));
    expect(module.default).toBeTypeOf('function');
  });

  it('allows state changes from the same plain-HTTP LAN origin', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { origin: baseUrl }
    });
    expect(response.status).toBe(200);
  });

  it('rejects state changes from a different browser origin', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { origin: 'http://attacker.example' }
    });
    expect(response.status).toBe(403);
  });

  it('rejects cross-site browser requests even when Origin is absent', async () => {
    const response = await fetch(baseUrl, {
      method: 'DELETE',
      headers: { 'sec-fetch-site': 'cross-site' }
    });
    expect(response.status).toBe(403);
  });

  it('rejects same-site cross-origin browser requests when Origin is absent', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-site' }
    });
    expect(response.status).toBe(403);
  });

  it('allows non-browser clients that send neither Origin nor Sec-Fetch-Site', async () => {
    const response = await fetch(baseUrl, { method: 'POST' });
    expect(response.status).toBe(200);
  });

  it('adds browser hardening headers without forcing HTTPS', async () => {
    const response = await fetch(baseUrl);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('adds HSTS only when trusted HTTPS proxy settings are enabled', async () => {
    const previous = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = '1';
    try {
      const response = await fetch(baseUrl, {
        headers: { 'x-forwarded-proto': 'https' }
      });
      expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000');
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY_HOPS;
      else process.env.TRUST_PROXY_HOPS = previous;
    }
  });

  it('does not trust forwarded HTTPS for a malformed proxy-hop setting', async () => {
    const previous = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = '1garbage';
    try {
      const response = await fetch(baseUrl, {
        headers: { 'x-forwarded-proto': 'https' }
      });
      expect(response.headers.get('strict-transport-security')).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY_HOPS;
      else process.env.TRUST_PROXY_HOPS = previous;
    }
  });
});
