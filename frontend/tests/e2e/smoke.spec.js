import { test, expect } from '@playwright/test';

// Phase 0 smoke test: prove the app boots, the migrations ran, and the user
// selection screen is reachable. Real auth flows arrive in later phases.
test.describe('smoke', () => {
  test('home page renders the user selection screen', async ({ page }) => {
    // /api/auth/me legitimately returns 401 when no session cookie exists
    // (the auth plugin probes it on every page load to restore sessions).
    // The browser logs that as a console "Failed to load resource" error
    // — filter it out and complain only about real errors.
    const EXPECTED_NOISE = /Failed to load resource:.*401|\/api\/auth\/me.*401/i;

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (EXPECTED_NOISE.test(text)) return;
      consoleErrors.push(text);
    });

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/SkillGoblin/i);

    await page.waitForLoadState('networkidle');

    // Confirm the user-listing API still responds (proxy for migration health).
    const apiUsers = await page.request.get('/api/users');
    expect(apiUsers.ok()).toBeTruthy();
    const body = await apiUsers.json();
    expect(Array.isArray(body)).toBe(true);

    if (consoleErrors.length) {
      throw new Error('Console errors during smoke test:\n' + consoleErrors.join('\n'));
    }
  });

  test('users table query path is wired up (proxy for migration success)', async ({ request }) => {
    // A direct "did 001_initial run?" assertion would need a debug endpoint we
    // don't expose. /api/users responding 200 with a JSON array proves the
    // `users` table was created — which only happens if migrations ran.
    const r = await request.get('/api/users');
    expect(r.ok()).toBeTruthy();
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
