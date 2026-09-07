import path from 'node:path';

// Evaluated when the process opens its database, not while Nuxt is built.
export function resolveDatabasePath(env = process.env, fallback) {
  return path.resolve(env.NUXT_DATABASE_PATH || env.DATABASE_PATH || env.DB_PATH || fallback || '/app/data/database/database.sqlite');
}
