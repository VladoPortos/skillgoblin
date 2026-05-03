import { getDb } from '../utils/db';
import { bootstrapAdmin, reportLegacyCredentialGaps } from '../utils/bootstrap';

// Nitro server plugin — runs once at startup before any request handler
// can serve traffic. Throwing here aborts the server boot, which is exactly
// what we want when ADMIN_NAME / ADMIN_PASSWORD are missing on a fresh
// install.
export default defineNitroPlugin(async (_nitroApp) => {
  const db = getDb();
  await bootstrapAdmin(db, process.env);
  reportLegacyCredentialGaps(db);
});
