import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    testTimeout: 10000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    }
  }
});
