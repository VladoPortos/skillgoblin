// Client-IP resolution for security-sensitive throttling.
//
// SECURITY: never trust `X-Forwarded-For` blindly. h3's getRequestIP(event,
// { xForwardedFor: true }) returns the *leftmost* XFF value, which is fully
// attacker-controlled (the client can send or prepend the header). Keying a
// rate limiter on that lets a caller mint a fresh bucket per request and
// bypass lockout entirely.
//
// Policy:
//   - Default (TRUST_PROXY_HOPS unset or 0): use the real transport peer
//     (socket.remoteAddress). Behind a single reverse proxy this is the
//     proxy's address — every attacker request then shares one bucket, which
//     is the safe failure mode (over-throttle, never under-throttle).
//   - TRUST_PROXY_HOPS=N (operator asserts N trusted proxies sit in front):
//     take the address the outermost trusted proxy observed, i.e. the N-th
//     entry counting from the RIGHT of the XFF chain. Everything further left
//     is client-supplied and untrusted.
export function getClientIp(event) {
  const raw = process.env.TRUST_PROXY_HOPS;
  const hops = raw ? parseInt(raw, 10) : 0;

  if (Number.isFinite(hops) && hops > 0) {
    const xff = event.node.req.headers['x-forwarded-for'];
    const chain = (Array.isArray(xff) ? xff.join(',') : xff || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    // The rightmost entry is the address our immediate (trusted) proxy saw;
    // counting `hops` in from the right skips the trusted-proxy addresses and
    // lands on the first client-influenced hop the outermost trusted proxy
    // recorded. Clamp so a short/forged chain falls back to the leftmost real
    // entry rather than an out-of-range read.
    const idx = Math.max(0, chain.length - hops);
    if (chain[idx]) return chain[idx];
  }

  return event.node.req.socket?.remoteAddress || 'unknown';
}
