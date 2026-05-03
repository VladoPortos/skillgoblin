import { existsSync, createReadStream } from 'node:fs';
import { defineEventHandler, setResponseHeader, createError } from 'h3';

// Operator-overridable login-screen banner. Wide-aspect PNG dropped at
// the documented data path. When absent, the endpoint returns 404 and
// the login page falls back to the existing /api/random-banner rotation.
const DATA_PATH = '/app/data/branding/login-banner.png';

export default defineEventHandler((event) => {
  if (!existsSync(DATA_PATH)) {
    throw createError({ statusCode: 404, statusMessage: 'No operator login banner configured' });
  }
  setResponseHeader(event, 'Content-Type', 'image/png');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return createReadStream(DATA_PATH);
});
