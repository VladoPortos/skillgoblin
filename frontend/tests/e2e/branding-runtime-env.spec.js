// This test deliberately probes that runtime env actually reaches the
// SPA. Codex flagged that the original implementation baked APP_* at
// Docker BUILD time so compose `environment:` values were silently
// ignored — this test would have failed before the fix and is the
// regression-guard going forward.
//
// We can't easily change the docker-compose.test.yml env mid-suite, so
// this test only asserts the runtime-config-driven shape. The actual
// "with APP_NAME=Foo, the page shows Foo" verification is in the
// manual smoke step.
//
// Pre-Nuxt-4 this test read window.__NUXT__.config.public.branding,
// but Nuxt 4 deletes that global post-hydration. We now assert on the
// rendered <title> + meta tags that app.vue's useHead() writes from
// runtimeConfig.public.branding — if runtimeConfig didn't reach the
// client, useHead would never run and those tags would fall back to
// the static defaults baked in nuxt.config.js's app.head. Asserting
// three independently-driven head fields catches the regression.
import { test, expect } from '@playwright/test';

test.describe('Runtime branding wiring', () => {
  test('useRuntimeConfig().public.branding reaches the client', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle('SkillGoblin');

    const description = await page.locator('head meta[name="description"]').getAttribute('content');
    expect(description).toBe('A streamlined, self-hosted learning platform');

    const themeColor = await page.locator('head meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBe('#111827');
  });
});
