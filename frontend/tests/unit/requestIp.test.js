import { describe, it, expect, afterEach } from 'vitest';
import { getClientIp } from '../../server/utils/requestIp.js';

function fakeEvent({ xff, remote } = {}) {
  const headers = {};
  if (xff !== undefined) headers['x-forwarded-for'] = xff;
  return { node: { req: { headers, socket: { remoteAddress: remote } } } };
}

const ORIGINAL = process.env.TRUST_PROXY_HOPS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = ORIGINAL;
});

describe('getClientIp', () => {
  it('ignores X-Forwarded-For by default and uses the transport peer', () => {
    delete process.env.TRUST_PROXY_HOPS;
    // Attacker-supplied XFF must NOT be trusted — the real socket wins.
    const ip = getClientIp(fakeEvent({ xff: '6.6.6.6', remote: '10.0.0.1' }));
    expect(ip).toBe('10.0.0.1');
  });

  it('does not let a spoofed leftmost XFF value mint a fresh key', () => {
    delete process.env.TRUST_PROXY_HOPS;
    const a = getClientIp(fakeEvent({ xff: 'spoof-a', remote: '10.0.0.1' }));
    const b = getClientIp(fakeEvent({ xff: 'spoof-b', remote: '10.0.0.1' }));
    // Rotating XFF cannot change the derived IP → cannot bypass the limiter.
    expect(a).toBe(b);
  });

  it('with TRUST_PROXY_HOPS=1 takes the proxy-appended client, not the spoofable leftmost', () => {
    process.env.TRUST_PROXY_HOPS = '1';
    // Client sent "1.1.1.1"; the trusted proxy appended the real peer "2.2.2.2".
    const ip = getClientIp(fakeEvent({ xff: '1.1.1.1, 2.2.2.2', remote: '127.0.0.1' }));
    expect(ip).toBe('2.2.2.2');
  });

  it('with a single trusted proxy and one XFF entry returns that entry', () => {
    process.env.TRUST_PROXY_HOPS = '1';
    const ip = getClientIp(fakeEvent({ xff: '203.0.113.5', remote: '127.0.0.1' }));
    expect(ip).toBe('203.0.113.5');
  });

  it('falls back to the socket when the trusted chain is empty', () => {
    process.env.TRUST_PROXY_HOPS = '1';
    const ip = getClientIp(fakeEvent({ remote: '10.0.0.9' }));
    expect(ip).toBe('10.0.0.9');
  });
});
