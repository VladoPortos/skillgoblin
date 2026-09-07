export default {
  name: '007_library_availability',
  up(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(courses)').all().map(c => c.name));
    if (!columns.has('available')) db.exec('ALTER TABLE courses ADD COLUMN available INTEGER NOT NULL DEFAULT 1');
    if (!columns.has('video_count')) db.exec('ALTER TABLE courses ADD COLUMN video_count INTEGER NOT NULL DEFAULT 0');
    if (!columns.has('video_ids')) db.exec("ALTER TABLE courses ADD COLUMN video_ids TEXT NOT NULL DEFAULT '[]'");
    const update = db.prepare('UPDATE courses SET video_count = ?, video_ids = ? WHERE id = ?');
    for (const row of db.prepare('SELECT id, data FROM courses').all()) {
      try {
        const ids = (JSON.parse(row.data).lessons || []).flatMap(l => (l.videos || []).map((v, i) => v.id || `${l.id}-${i}`));
        update.run(ids.length, JSON.stringify(ids), row.id);
      } catch { /* Leave corrupt metadata available for operator recovery. */ }
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_courses_available_title ON courses(available, title)');
  }
};
