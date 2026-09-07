const registeredDatabases = new WeakSet();
export function queryCourseCatalog(db, { sort = 'title', category, search = '', page = 1, limit = 9 } = {}) {
  if (!registeredDatabases.has(db)) {
    db.function('unicode_lower', { deterministic: true }, value => String(value ?? '').toLowerCase());
    registeredDatabases.add(db);
  }
  const where = ['available = 1'];
  const args = [];
  if (category && category !== 'all') { where.push('category = ?'); args.push(category); }
  if (search) {
    where.push("(instr(unicode_lower(coalesce(title,'')), ?) > 0 OR instr(unicode_lower(coalesce(description,'')), ?) > 0 OR instr(unicode_lower(coalesce(category,'')), ?) > 0)");
    args.push(...Array(3).fill(search.toLowerCase()));
  }
  const clause = where.join(' AND ');
  const totalItems = db.prepare('SELECT COUNT(*) AS count FROM courses WHERE ' + clause).get(...args).count;
  const categoryCounts = Object.create(null);
  categoryCounts.all = 0;
  for (const row of db.prepare("SELECT coalesce(nullif(category, ''), 'Uncategorized') AS category, count(*) AS count FROM courses WHERE available = 1 GROUP BY coalesce(nullif(category, ''), 'Uncategorized')").all()) {
    categoryCounts[row.category] = row.count;
    categoryCounts.all += row.count;
  }
  const order = sort === 'newest' ? 'created_at DESC, id ASC' : 'title ASC, id ASC';
  const items = db.prepare(`SELECT id, title, description, category, thumbnail, release_date AS releaseDate, created_at, CASE WHEN json_valid(data) THEN coalesce(json_extract(data, '$.lastUpdate'), updated_at) ELSE updated_at END AS lastUpdate, video_count AS videoCount, video_ids FROM courses WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit).map(({ video_ids, ...row }) => ({ ...row, videoIds: JSON.parse(video_ids) }));
  return { totalItems, totalPages: Math.ceil(totalItems / limit), currentPage: page, pageSize: limit, items, categoryCounts, lastUpdate: Date.now() };
}
