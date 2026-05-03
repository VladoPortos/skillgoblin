import { test, expect, request as pwRequest } from '@playwright/test';

async function freshContext() {
  return pwRequest.newContext({ baseURL: process.env.PW_BASE_URL || 'http://app:3000' });
}

test.describe('GET /api/webmanifest', () => {
  test('returns a JSON manifest with the documented shape', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/webmanifest');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toMatch(/application\/manifest\+json|application\/json/);
    const body = await r.json();
    expect(body).toMatchObject({
      name: 'SkillGoblin',
      short_name: 'SkillGoblin',
      description: 'A streamlined, self-hosted learning platform',
      theme_color: '#111827',
      background_color: '#111827',
      display: 'standalone'
    });
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons.length).toBeGreaterThanOrEqual(1);
    await ctx.dispose();
  });
});

test.describe('GET /api/logo', () => {
  // In the test container, /app/data/branding/logo.png IS present (mounted
  // from frontend/tests/fixtures/branding/logo.png). The response should
  // serve THAT, not the bundled fallback. The override-path describe below
  // does the byte-level assertion; this test just confirms shape.
  test('returns a PNG with correct content-type and PNG magic bytes', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/logo');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await ctx.dispose();
  });
});

test.describe('GET /api/login-banner', () => {
  // The test container mounts frontend/tests/fixtures/branding/login-banner.png
  // at /app/data/branding/login-banner.png, so the endpoint serves it.
  // The override-path describe below does the byte-level check; this is
  // a shape check.
  test('returns a PNG with correct content-type when the override exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/login-banner');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await ctx.dispose();
  });
});

test.describe('Login screen — h1 reflects APP_NAME', () => {
  test('default APP_NAME shows "SkillGoblin" as the h1', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const h1 = page.locator('h1');
    await expect(h1).toHaveText('SkillGoblin');
  });
});

test.describe('GET /api/logo — operator override path', () => {
  test('serves the fixture PNG when /app/data/branding/logo.png exists', async () => {
    // The test compose mounts ./frontend/tests/fixtures/branding to
    // /app/data/branding inside the app container, so the override
    // file is present. We assert the response body bytes match the
    // fixture file's bytes — proves the operator file actually serves
    // (not the bundled fallback).
    const ctx = await freshContext();
    const r = await ctx.get('/api/logo');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    // Read the fixture file directly via Node fs to compare bytes.
    const fs = await import('node:fs');
    const fixture = fs.readFileSync('/work/tests/fixtures/branding/logo.png');
    expect(buf.equals(fixture)).toBe(true);
    await ctx.dispose();
  });
});

test.describe('GET /api/login-banner — operator override path', () => {
  test('serves the fixture PNG when /app/data/branding/login-banner.png exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/login-banner');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    const fs = await import('node:fs');
    const fixture = fs.readFileSync('/work/tests/fixtures/branding/login-banner.png');
    expect(buf.equals(fixture)).toBe(true);
    await ctx.dispose();
  });
});
