import { test, expect, request as pwRequest } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function getAdmin(request) {
  const r = await request.get('/api/users');
  const users = await r.json();
  return users.find(u => u.name === ADMIN_NAME);
}

// Each test uses a fresh request context so session cookies don't leak across tests.
async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://app:3000' });
}

test.describe('session lifecycle', () => {
  test('login sets the sg_session cookie; /api/auth/me returns the user', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);

    const r = await ctx.post('/api/users/auth', {
      data: { userId: admin.id, password: ADMIN_PASSWORD }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.success).toBe(true);

    const cookies = await ctx.storageState();
    const sg = cookies.cookies.find(c => c.name === 'sg_session');
    expect(sg, 'sg_session cookie should be set').toBeTruthy();
    expect(sg.httpOnly).toBe(true);
    expect(sg.sameSite.toLowerCase()).toBe('lax');

    const me = await ctx.get('/api/auth/me');
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    expect(meBody.user.id).toBe(admin.id);
    expect(meBody.user.isAdmin).toBe(1);

    await ctx.dispose();
  });

  test('/api/auth/me returns 401 without a session', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/auth/me');
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('logout clears the cookie and /api/auth/me returns 401 after', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });

    const lo = await ctx.post('/api/users/logout');
    expect(lo.ok()).toBeTruthy();

    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(401);
    await ctx.dispose();
  });
});

test.describe('authorization gates', () => {
  test('PUT /api/users requires a session', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    const r = await ctx.put('/api/users', { data: { id: admin.id, name: 'evil' } });
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('PUT /api/users by a non-admin cannot mutate someone else', async () => {
    // Create a regular user, log in as them, try to PUT the admin.
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);

    const create = await ctx.post('/api/users', {
      data: { name: `pleb-${Date.now()}`, password: 'pleb1234' }
    });
    const pleb = await create.json();

    // Strict-mode signups are inactive; admin must activate before they can log in.
    const adminCtx = await freshContext();
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    const activate = await adminCtx.put('/api/users', {
      data: { id: pleb.id, name: pleb.name, is_active: 1 }
    });
    expect(activate.ok()).toBeTruthy();
    await adminCtx.dispose();

    const userCtx = await freshContext();
    const login = await userCtx.post('/api/users/auth', {
      data: { userId: pleb.id, password: 'pleb1234' }
    });
    expect((await login.json()).success).toBe(true);

    // Now the non-admin tries to update the admin's account.
    const attack = await userCtx.put('/api/users', {
      data: { id: admin.id, name: 'pwned' }
    });
    expect(attack.status()).toBe(403);
    await userCtx.dispose();
  });

  test('non-admin cannot promote themselves via PUT /api/users', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    const create = await ctx.post('/api/users', {
      data: { name: `self-promote-${Date.now()}`, password: 'pleb1234' }
    });
    const pleb = await create.json();

    const adminCtx = await freshContext();
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, is_active: 1 } });
    await adminCtx.dispose();

    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: pleb.id, password: 'pleb1234' } });
    const r = await userCtx.put('/api/users', {
      data: { id: pleb.id, name: pleb.name, isAdmin: 1 }
    });
    expect(r.status()).toBe(403);
    await userCtx.dispose();
  });

  test('admin courses/edit requires admin session (was previously spoofable via x-user-id header)', async () => {
    // Anonymous: 401
    const anonCtx = await freshContext();
    const anon = await anonCtx.post('/api/courses/edit', {
      data: 'whatever',
      headers: { 'x-user-id': 'fake', 'content-type': 'application/json' }
    });
    expect(anon.status()).toBe(401);
    await anonCtx.dispose();
  });

  test('rescan endpoint requires admin', async () => {
    const ctx = await freshContext();
    const r = await ctx.post('/api/courses/rescan');
    expect(r.status()).toBe(401);
    await ctx.dispose();
  });

  test('user-progress GET/POST require self-or-admin', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);

    // Anonymous read of admin's progress: 401
    const anon = await ctx.get(`/api/user-progress/${admin.id}`);
    expect(anon.status()).toBe(401);

    // Non-admin reading someone else's progress: 403
    const create = await ctx.post('/api/users', {
      data: { name: `prog-${Date.now()}`, password: 'pleb1234' }
    });
    const pleb = await create.json();
    const adminCtx = await freshContext();
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    await adminCtx.put('/api/users', { data: { id: pleb.id, name: pleb.name, is_active: 1 } });
    await adminCtx.dispose();

    const userCtx = await freshContext();
    await userCtx.post('/api/users/auth', { data: { userId: pleb.id, password: 'pleb1234' } });
    const peek = await userCtx.get(`/api/user-progress/${admin.id}`);
    expect(peek.status()).toBe(403);
    await userCtx.dispose();
    await ctx.dispose();
  });
});

test.describe('rate limiting', () => {
  test('5 wrong attempts in a row lock the (user, ip) pair out with 429', async () => {
    // Create a throwaway user so we don't burn the admin's rate-limit
    // bucket. The user must be ACTIVATED first — the auth endpoint short-
    // circuits inactive users without touching the rate limiter (so an
    // attacker can't lock out a pending account by spam-hitting it).
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    const create = await ctx.post('/api/users', {
      data: { name: `rl-${Date.now()}`, password: 'realpass1234' }
    });
    const target = await create.json();

    const adminCtx = await freshContext();
    await adminCtx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
    const activate = await adminCtx.put('/api/users', {
      data: { id: target.id, name: target.name, is_active: 1 }
    });
    expect(activate.ok()).toBeTruthy();
    await adminCtx.dispose();

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const r = await ctx.post('/api/users/auth', {
        data: { userId: target.id, password: 'definitely-wrong' }
      });
      lastStatus = r.status();
    }
    // After 5 fails recorded the 6th attempt is in the lockout window.
    expect(lastStatus).toBe(429);

    await ctx.dispose();
  });
});

test.describe('last-admin protection', () => {
  test('admin cannot demote themselves when they are the only admin', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });

    const r = await ctx.put('/api/users', {
      data: { id: admin.id, name: admin.name, isAdmin: 0 }
    });
    expect(r.status()).toBe(409);
    await ctx.dispose();
  });

  test('admin cannot delete themselves when they are the only admin', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });

    const r = await ctx.post('/api/users/delete', { data: { userId: admin.id } });
    expect(r.status()).toBe(409);
    await ctx.dispose();
  });

  test('admin cannot deactivate themselves when they are the only admin (Codex BLOCKER 1 regression test)', async () => {
    const ctx = await freshContext();
    const admin = await getAdmin(ctx);
    await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });

    const r = await ctx.put('/api/users', {
      data: { id: admin.id, name: admin.name, is_active: 0 }
    });
    expect(r.status()).toBe(409);
    await ctx.dispose();
  });
});

test.describe('post-login UI render', () => {
  test('/courses page renders without console errors after login (regression for the useAuth crash)', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

    // Establish session via API (cookie attaches to the page context).
    const admin = await getAdmin(page.request);
    const r = await page.request.post('/api/users/auth', {
      data: { userId: admin.id, password: ADMIN_PASSWORD }
    });
    expect(r.ok()).toBeTruthy();

    await page.goto('/courses');
    await page.waitForLoadState('networkidle');

    const real = consoleErrors.filter(t => !/Failed to load resource:.*40[14]/i.test(t));
    if (real.length) {
      throw new Error('Console errors on /courses:\n' + real.join('\n'));
    }
  });
});
