import { test, expect, request as pwRequest } from '@playwright/test';

const ADMIN_NAME = process.env.PW_ADMIN_NAME || 'root';
const ADMIN_PASSWORD = process.env.PW_ADMIN_PASSWORD || 'TestAdminPass!';

async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://app:3000' });
}

async function getAdmin(request) {
  const r = await request.get('/api/users');
  const users = await r.json();
  return users.find(u => u.name === ADMIN_NAME);
}

async function loginAdmin() {
  const ctx = await freshContext();
  const admin = await getAdmin(ctx);
  await ctx.post('/api/users/auth', { data: { userId: admin.id, password: ADMIN_PASSWORD } });
  return { ctx, admin };
}

async function setRegistration(allowed) {
  const { ctx } = await loginAdmin();
  const r = await ctx.put('/api/system-settings', {
    data: { key: 'allow_user_registration', value: !!allowed }
  });
  expect(r.ok()).toBeTruthy();
  await ctx.dispose();
}

test.describe('POST /api/users — registration lock', () => {
  test.afterEach(async () => {
    // Always leave the system back at allowed=true so unrelated suites are
    // not affected.
    await setRegistration(true);
  });

  test('anon signup succeeds when registration allowed (unchanged behavior)', async () => {
    await setRegistration(true);
    const ctx = await freshContext();
    const r = await ctx.post('/api/users', {
      data: { name: `anon-allowed-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.id).toBeTruthy();
    await ctx.dispose();
  });

  test('anon signup is refused with 403 when registration disabled', async () => {
    await setRegistration(false);
    const ctx = await freshContext();
    const r = await ctx.post('/api/users', {
      data: { name: `anon-blocked-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.status()).toBe(403);
    await ctx.dispose();
  });

  test('admin can create a user even when registration disabled', async () => {
    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const name = `admin-created-${Date.now()}`;
    const r = await ctx.post('/api/users', {
      data: { name, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe(name);
    expect(body.is_active).toBe(1); // admin-created → always active
    expect(body.isAdmin).toBe(0);   // admin-created → always normal user
    await ctx.dispose();
  });

  test('admin-created user is active even when auto_approve_new_users=false', async () => {
    // Toggle auto_approve_new_users off explicitly.
    const { ctx: adm } = await loginAdmin();
    await adm.put('/api/system-settings', {
      data: { key: 'auto_approve_new_users', value: false }
    });
    await adm.dispose();

    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const r = await ctx.post('/api/users', {
      data: { name: `admin-approve-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.is_active).toBe(1);
    await ctx.dispose();
  });

  test('admin-created user cannot self-promote via body.isAdmin', async () => {
    await setRegistration(false);
    const { ctx } = await loginAdmin();
    const r = await ctx.post('/api/users', {
      data: { name: `not-admin-${Date.now()}`, password: 'pw12345!', isAdmin: 1 }
    });
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(body.isAdmin).toBe(0);
    await ctx.dispose();
  });

  test('non-admin authenticated user cannot create when registration disabled', async () => {
    await setRegistration(true);
    const setupCtx = await freshContext();
    const sig = await setupCtx.post('/api/users', {
      data: { name: `pleb-${Date.now()}`, password: 'pw12345!' }
    });
    const pleb = await sig.json();
    await setupCtx.dispose();

    // Activate pleb so login works under default strict-approval.
    const { ctx: adm } = await loginAdmin();
    await adm.put('/api/users', {
      data: { id: pleb.id, name: pleb.name, is_active: 1 }
    });
    await adm.dispose();

    const plebCtx = await freshContext();
    await plebCtx.post('/api/users/auth', {
      data: { userId: pleb.id, password: 'pw12345!' }
    });

    await setRegistration(false);

    const r = await plebCtx.post('/api/users', {
      data: { name: `pleb-create-${Date.now()}`, password: 'pw12345!' }
    });
    expect(r.status()).toBe(403);
    await plebCtx.dispose();
  });
});
