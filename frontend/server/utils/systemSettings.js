// Read a boolean system setting stored as the canonical 'true' / 'false'
// string in the system_settings table. Missing rows fall back to the
// provided default.
export function getBoolSetting(db, key, defaultValue) {
  const row = db
    .prepare('SELECT value FROM system_settings WHERE key = ?')
    .get(key);
  return (row?.value ?? String(defaultValue)) === 'true';
}
