import { defineEventHandler, getMethod, readBody } from 'h3';
import { getDb } from '../utils/db';
import { getAllCoursesFromDb, getCourseFromDb } from '../utils/courseDatabase';
import { setupFileWatcher } from '../utils/courseWatcher';

// Set up file watching
setupFileWatcher();

// Main API handler
export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  
  // GET - Retrieve all courses or a specific course
  if (method === 'GET') {
    const courseId = event.context.params?.id;
    
    if (courseId) {
      // Get a specific course
      try {
        // Get from database
        const course = getCourseFromDb(courseId);
        
        if (course) {
          return course;
        } else {
          return { error: 'Course not found' };
        }
      } catch (error) {
        console.error(`Error retrieving course ${courseId}:`, error);
        return { error: 'Failed to retrieve course' };
      }
    } else {
      // Get all courses
      try {
        // Get courses from database
        const courses = getAllCoursesFromDb();
        
        // Calculate category counts from all courses before filtering
        const categoryCounts = {};
        categoryCounts['all'] = courses.length;
        
        // Count courses per category
        courses.forEach(course => {
          const category = course.category || 'Uncategorized';
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        
        // Get filter and pagination parameters from query
        const url = new URL(event.node.req.url, 'http://localhost');
        const category = url.searchParams.get('category');
        const searchQuery = url.searchParams.get('search')?.toLowerCase();
        const page = parseInt(url.searchParams.get('page')) || 1;
        const limit = parseInt(url.searchParams.get('limit')) || 9; // Default 9 courses per page
        
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
        return { 
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          pageSize: 9,
          items: [],
          categoryCounts: { 'all': 0 }
        };
      }
    }
  }
  
  // POST - Refresh course data or rescan
  if (method === 'POST') {
    try {
      const body = await readBody(event);
      
      if (body.action === 'refresh') {
        const courseId = body.courseId;
        
        if (!courseId) {
          return { error: 'Course ID is required' };
        }
        
        // Get course from database
        const course = getCourseFromDb(courseId);
        
        if (!course) {
          return { error: 'Course not found' };
        }
        
        // For refreshing, we'll trigger a database update with the lastUpdate field
        // to bust any caches
        const db = getDb();
        
        // Parse existing data and update lastUpdate timestamp
        const courseData = JSON.parse(JSON.stringify(course)); // Deep clone
        courseData.lastUpdate = Date.now();
        
        // Update the database
        db.prepare(`
          UPDATE courses 
          SET data = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(JSON.stringify(courseData), courseId);
        
        return courseData;
      } else if (body.action === 'rescan') {
        // Redirect to the dedicated rescan endpoint
        return $fetch('/api/courses/rescan', { method: 'POST' });
      }
      
      return { error: 'Invalid action' };
    } catch (error) {
      console.error('Error processing request:', error);
      return { error: 'Failed to process request' };
    }
  }
});
