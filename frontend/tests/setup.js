// Vitest setup: stub Nuxt runtime helpers so server modules that reference
// them at import time (e.g. server/utils/db.js) can be loaded under Node.
import os from 'node:os';
import path from 'node:path';

if (typeof globalThis.useRuntimeConfig !== 'function') {
  globalThis.useRuntimeConfig = () => ({
    databasePath: path.join(os.tmpdir(), `sg-vitest-${process.pid}.sqlite`),
  });
}
