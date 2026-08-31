export function filterAndSortCourses(
  courses,
  { search = '', category = 'all', sort = 'title' } = {}
) {
  const query = String(search || '').trim().toLocaleLowerCase();
  const filtered = (Array.isArray(courses) ? courses : []).filter(course => {
    if (category && category !== 'all' && course?.category !== category) return false;
    if (!query) return true;
    return [course?.title, course?.description, course?.category]
      .some(value => String(value || '').toLocaleLowerCase().includes(query));
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'newest') {
      const delta = Date.parse(b?.created_at || '') - Date.parse(a?.created_at || '');
      if (Number.isFinite(delta) && delta !== 0) return delta;
    }
    return String(a?.title || '').localeCompare(String(b?.title || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}
