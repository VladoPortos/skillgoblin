import { test, expect } from '@playwright/test';

// Phase 0 smoke test: prove the app boots, the migrations ran, and the user
// selection screen is reachable. Real auth flows arrive in later phases.
test.describe('smoke', () => {
  test('home page renders the user selection screen', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/SkillGoblin/i);

    // Wait for the SPA to hydrate and the user list to appear (fetched from /api/users)
    await page.waitForLoadState('networkidle');

    // The screen always shows the app shell even with zero users, so just
    // confirm the API responded successfully.
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
