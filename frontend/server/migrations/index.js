// Manifest of migrations in apply order. Add new migrations to the end of this list.
// Each migration must export `{ name, up(db) }` and be idempotent against its own
// recorded state (the runner records names, but the migration body itself should
// also tolerate being run against a partially-prepared DB where reasonable).
import m001_initial from './001_initial.js';
import m002_auth_hardening from './002_auth_hardening.js';

export default [
  m001_initial,
  m002_auth_hardening
];
