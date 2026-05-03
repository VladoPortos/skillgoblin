import { existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { defineEventHandler, setResponseHeader } from 'h3';

// Operator-overridable square logo. Drop a PNG at the documented data
// path to override; otherwise the bundled SkillGoblin square logo serves.
//
// Cache: 5 minutes — short enough that operator changes show up fast,
// long enough that browsers don't re-fetch on every page nav.
const DATA_PATH = '/app/data/branding/logo.png';
const FALLBACK_PATH = join(process.cwd(), 'public/logos/skillgoblin-logo-square.png');

export default defineEventHandler((event) => {
  const path = existsSync(DATA_PATH) ? DATA_PATH : FALLBACK_PATH;
  setResponseHeader(event, 'Content-Type', 'image/png');
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300');
  return createReadStream(path);
});
