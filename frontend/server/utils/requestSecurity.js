// Decide whether the browser-facing request is HTTPS without breaking the
// default direct-LAN HTTP deployment. Forwarded scheme is trusted only when
// the operator explicitly configured a proxy boundary or forced secure
// cookies for TLS termination upstream.
export function isSecureRequest(event) {
  const override = (process.env.COOKIE_SECURE || '').trim().toLowerCase();
  if (override === 'false') return false;
  if (event.node.req.socket?.encrypted) return true;

  const trustForwardedProto = getTrustedProxyHops() > 0 || override === 'true';
  if (trustForwardedProto) {
    const forwarded = event.node.req.headers['x-forwarded-proto'];
    if (typeof forwarded === 'string' && forwarded.split(',')[0].trim().toLowerCase() === 'https') {
      return true;
    }
  }

  return override === 'true';
}
import { getTrustedProxyHops } from './requestIp.js';
