import { defineConfig, devices } from '@playwright/test';

// Tests are intended to run inside the dockerized test runner
// (see docker-compose.test.yml at the repo root). The runner reaches the app
// over the docker network at http://app:3000 by default. The PW_BASE_URL env
// var lets you override for local debugging if you ever spin up an app
// outside of compose.
const baseURL = process.env.PW_BASE_URL || 'http://app:3000';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.js/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
