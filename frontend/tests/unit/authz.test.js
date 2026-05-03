import { describe, it, expect } from 'vitest';
import { requireAuth, requireAdmin, requireSelfOrAdmin } from '../../server/utils/authz.js';

function fakeEvent(user) {
  return { context: { user } };
}

describe('requireAuth', () => {
  it('throws 401 when no session user is set', () => {
    expect(() => requireAuth(fakeEvent(undefined))).toThrow();
    try { requireAuth(fakeEvent(undefined)); } catch (e) { expect(e.statusCode).toBe(401); }
  });

  it('throws 403 when the user is inactive', () => {
    expect(() => requireAuth(fakeEvent({ id: 'u1', is_active: 0 }))).toThrow();
    try {
      requireAuth(fakeEvent({ id: 'u1', is_active: 0 }));
    } catch (e) {
      expect(e.statusCode).toBe(403);
    }
  });

  it('returns the user when authenticated and active', () => {
    const u = { id: 'u1', name: 'Alice', is_active: 1, isAdmin: 0 };
    expect(requireAuth(fakeEvent(u))).toBe(u);
  });
});

describe('requireAdmin', () => {
  it('throws 403 for a non-admin', () => {
    try {
      requireAdmin(fakeEvent({ id: 'u1', is_active: 1, isAdmin: 0 }));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(403);
    }
  });

  it('returns the user when admin', () => {
    const u = { id: 'a1', is_active: 1, isAdmin: 1 };
    expect(requireAdmin(fakeEvent(u))).toBe(u);
  });
});

describe('requireSelfOrAdmin', () => {
  it('passes for self', () => {
    const u = { id: 'u1', is_active: 1, isAdmin: 0 };
    expect(requireSelfOrAdmin(fakeEvent(u), 'u1')).toBe(u);
  });

  it('passes for an admin acting on someone else', () => {
    const u = { id: 'a1', is_active: 1, isAdmin: 1 };
    expect(requireSelfOrAdmin(fakeEvent(u), 'u1')).toBe(u);
  });

  it('throws 403 for a non-admin acting on someone else', () => {
    try {
      requireSelfOrAdmin(fakeEvent({ id: 'u1', is_active: 1, isAdmin: 0 }), 'u2');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(403);
    }
  });

  it('throws 401 when no session', () => {
    try {
      requireSelfOrAdmin(fakeEvent(undefined), 'u1');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.statusCode).toBe(401);
    }
  });
});
