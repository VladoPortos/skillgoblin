import { describe, it, expect } from 'vitest';
import * as filters from '../../utils/courseFilters.js';

const courses = [
  { id: 'z', title: 'Zulu', description: 'General', category: 'Design', created_at: '2025-01-01T00:00:00Z' },
  { id: 'a', title: 'Alpha', description: 'General', category: 'Code', created_at: '2026-01-01T00:00:00Z' },
  { id: 'b', title: 'Beta', description: 'Needle topic', category: 'Design', created_at: '2024-01-01T00:00:00Z' }
];

describe('filterAndSortCourses', () => {
  it('applies search and category filters to a complete tab list', () => {
    expect(typeof filters.filterAndSortCourses).toBe('function');
    expect(filters.filterAndSortCourses(courses, { search: 'needle' }).map(c => c.id)).toEqual(['b']);
    expect(filters.filterAndSortCourses(courses, { category: 'Design' }).map(c => c.id)).toEqual(['b', 'z']);
  });

  it('sorts by title or newest without mutating the source list', () => {
    expect(typeof filters.filterAndSortCourses).toBe('function');
    expect(filters.filterAndSortCourses(courses, { sort: 'title' }).map(c => c.id)).toEqual(['a', 'b', 'z']);
    expect(filters.filterAndSortCourses(courses, { sort: 'newest' }).map(c => c.id)).toEqual(['a', 'z', 'b']);
    expect(courses.map(c => c.id)).toEqual(['z', 'a', 'b']);
  });
});
