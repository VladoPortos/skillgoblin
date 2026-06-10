import { defineEventHandler, getMethod, createError } from 'h3';
import { getAllCoursesWithMeta } from '../utils/courseDatabase';
import { parseNewBadgeDays, isWithinNewWindow } from '../utils/recencyHelpers.js';

const MAX_PAGE_SIZE = 100;

// Main API handler
export default defineEventHandler(async (event) => {
  const method = getMethod(event);

  // GET - Retrieve all courses
  if (method === 'GET') {
    try {
      // Get filter and pagination parameters from query
      const url = new URL(event.node.req.url, 'http://localhost');
      const sortParam = url.searchParams.get('sort');
      const sort = sortParam === 'newest' ? 'newest' : 'title';
      if (sortParam && sort !== sortParam) {
        console.warn(`[courses] unknown sort "${sortParam}", falling back to title`);
      }
      const courses = getAllCoursesWithMeta(null, { sort });
      const newDays = parseNewBadgeDays(process.env.NEW_BADGE_DAYS);
      const nowMs = Date.now();
      for (const c of courses) {
        c.isNew = isWithinNewWindow(c.created_at, newDays, nowMs);
      }

      // Calculate category counts from all courses before filtering
      const categoryCounts = {};
      categoryCounts['all'] = courses.length;

      // Count courses per category
      courses.forEach(course => {
        const category = course.category || 'Uncategorized';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });

      const category = url.searchParams.get('category');
      const searchQuery = url.searchParams.get('search')?.toLowerCase();
      const page = Math.max(parseInt(url.searchParams.get('page')) || 1, 1);
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit')) || 9, 1), MAX_PAGE_SIZE); // Default 9 courses per page

      // Apply filters first
      let filteredCourses = [...courses];

      // Apply category filter if specified
      if (category && category !== 'all') {
        filteredCourses = filteredCourses.filter(course => course.category === category);
      }

      // Apply search filter if specified
      if (searchQuery) {
        filteredCourses = filteredCourses.filter(course =>
          course.title?.toLowerCase().includes(searchQuery) ||
          course.description?.toLowerCase().includes(searchQuery) ||
          course.category?.toLowerCase().includes(searchQuery)
        );
      }

      // Calculate start and end indices for pagination
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      // Create a pagination result object
      const paginationResult = {
        totalItems: filteredCourses.length,
        totalPages: Math.ceil(filteredCourses.length / limit),
        currentPage: page,
        pageSize: limit,
        items: filteredCourses.slice(startIndex, endIndex),
        categoryCounts: categoryCounts,
        lastUpdate: Date.now() // Add timestamp for cache busting
      };

      return paginationResult;
    } catch (error) {
      console.error('Error retrieving courses:', error);
      throw createError({ statusCode: 500, statusMessage: 'Failed to load courses' });
    }
  }
});
