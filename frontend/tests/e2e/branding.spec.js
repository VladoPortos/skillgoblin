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
  test('falls back to the bundled square logo when no override file exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/logo');
    expect(r.ok()).toBeTruthy();
    expect(r.headers()['content-type']).toBe('image/png');
    const buf = await r.body();
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    await ctx.dispose();
  });
});

test.describe('GET /api/login-banner', () => {
  test('returns 404 when no override file exists', async () => {
    const ctx = await freshContext();
    const r = await ctx.get('/api/login-banner');
    expect(r.status()).toBe(404);
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
