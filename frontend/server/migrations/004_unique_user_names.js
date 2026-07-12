export default {
  name: '004_unique_user_names',
  up(db) {
    const duplicates = db.prepare(`
      SELECT name, COUNT(*) AS count
      FROM users
      GROUP BY name COLLATE NOCASE
      HAVING COUNT(*) > 1
      ORDER BY name COLLATE NOCASE
    `).all();

    if (duplicates.length > 0) {
      const names = duplicates.map(row => row.name).join(', ');
      throw new Error(
        `Cannot enforce unique user names: duplicate user names exist (${names}). ` +
        'Rename duplicates from an older SkillGoblin version, then restart.'
      );
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_nocase_unique
      ON users(name COLLATE NOCASE)
    `);
  }
};
