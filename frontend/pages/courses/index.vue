<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <header class="bg-white dark:bg-gray-800 shadow-sm">
      <div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <NuxtLink to="/courses" class="flex items-center hover:opacity-80 transition-opacity" :aria-label="`${branding.name} home`">
          <img :src="'/api/logo'" :alt="`${branding.name} Logo`" class="w-10 h-10 mr-3" />
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ branding.name }}</h1>
        </NuxtLink>
        <div class="flex items-center space-x-4">
          <UserProfile
            :user="userObject"
            @logout="logout"
            @delete="showDeleteConfirm = true"
            @rescan="startRescan"
            @manage="showUserManagement = true"
            @admin="showAdminPanel = true"
          />
          <ThemeToggle />
        </div>
      </div>
    </header>

    <!-- Delete account confirmation modal -->
    <ConfirmationModal
      v-if="showDeleteConfirm"
      title="Delete Account"
      message="Are you sure you want to delete your account? This action cannot be undone and all your progress will be lost."
      confirm-button-text="Delete Account"
      cancel-button-text="Cancel"
      confirm-button-color="red"
      :show="showDeleteConfirm"
      :is-loading="isDeleting"
      loading-text="Deleting..."
      @confirm="deleteAccount"
      @cancel="showDeleteConfirm = false"
    />

    <!-- My Profile modal (personal: name, avatar, password, PIN) -->
    <UserManagement
      v-if="showUserManagement"
      :show="showUserManagement"
      :user="userObject"
      @close="showUserManagement = false"
      @updated="showUserManagement = false"
    />

    <!-- Admin Panel Modal (admin-only entry, server enforces authz) -->
    <AdminPanel
      v-if="showAdminPanel"
      :show="showAdminPanel"
      @close="showAdminPanel = false"
    />

    <!-- Rescan Confirmation Modal -->
    <RescanConfirmModal
      v-if="showRescanConfirm"
      v-model="preserveMetadata"
      :show="showRescanConfirm"
      @confirm="confirmRescan"
      @cancel="showRescanConfirm = false"
    />

    <!-- Saving overlay -->
    <div
      v-if="isSavingCourse"
      class="fixed inset-0 bg-black/50 z-[9999] flex justify-center items-center"
    >
      <div class="bg-white p-5 rounded-lg shadow-lg">
        <p class="m-0">Saving course data...</p>
      </div>
    </div>

    <!-- Course Editor Modal -->
    <div
      v-if="showCourseEditor"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      @click.self="closeCourseEditor"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              {{ currentCourse?.id ? 'Edit Course' : 'Create Course' }}
            </h2>
            <button
              @click="closeCourseEditor"
              class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <CourseEditor
            :course="currentCourse"
            @save="saveCourse"
            @cancel="closeCourseEditor"
          />
        </div>
      </div>
    </div>

    <main>
      <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">

        <!-- Initial Scan Loading State -->
        <div v-if="showLoadingIndicator" class="px-4 py-8 text-center">
          <div class="flex flex-col items-center justify-center">
            <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"></div>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Collecting Course Data...</h2>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Please wait while we scan and build the course database.
            </p>
            <div class="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
              <div
                class="bg-primary-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                :style="`width: ${getScanProgressPercent}%`"
              ></div>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ initialScan.processedCourses }} of {{ initialScan.totalCourses }} courses processed
            </p>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="initialScan.error" class="px-4 py-8 text-center">
          <div class="flex flex-col items-center justify-center">
            <div class="rounded-full h-12 w-12 bg-red-100 dark:bg-red-900 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Error Scanning Courses</h2>
            <p class="text-gray-600 dark:text-gray-400 mb-4">
              {{ initialScan.error }}
            </p>
            <button
              @click="retryScan"
              class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition"
            >
              Retry Scan
            </button>
          </div>
        </div>

        <!-- Regular Content when scan is complete -->
        <div v-else>
          <div class="px-4 py-3 sm:px-0">
            <!-- Category Filters -->
            <CategoryFilterBar
              :categories="categories"
              :selected-category="selectedCategory"
              :category-counts="categoryCounts"
              :category-colors="categoryColors"
              @select-category="selectedCategory = $event"
            />

            <!-- Search + sort -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 mt-3 mb-6">
              <div class="flex-1">
                <SearchBar
                  v-model:search-query="searchQuery"
                  placeholder="Search courses..."
                />
              </div>
              <label class="flex items-center text-sm text-gray-700 dark:text-gray-300">
                <span class="mr-2">Sort:</span>
                <select
                  data-testid="course-sort"
                  v-model="sortMode"
                  class="block px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                >
                  <option value="title">Title (A–Z)</option>
                  <option value="newest">Newest first</option>
                </select>
              </label>
            </div>
          </div>

          <!-- Tabs -->
          <TabNavigation
            :tabs="tabs"
            :active-tab="activeTab"
            @select-tab="activeTab = $event"
          />

          <!-- Tab Content -->
          <div class="mt-6 px-4 py-6 sm:px-0">
            <!-- All Courses Tab -->
            <div v-if="activeTab === 'all'">
              <div v-if="courses.length" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <CourseCard
                  v-for="course in courses"
                  :key="course.id"
                  :course="course"
                  :progress="courseProgress[course.id] || 0"
                  :is-admin="isAdmin"
                  @edit-course="editCourse"
                />
              </div>
              <div v-else class="text-gray-500 dark:text-gray-400 text-center py-8">
                No courses found matching your criteria
              </div>

              <!-- Pagination Controls -->
              <div v-if="totalPages > 1" class="flex justify-center mt-8">
                <nav class="flex items-center space-x-2" aria-label="Pagination">
                  <!-- Previous Page Button -->
                  <button
                    @click="changePage(currentPage - 1)"
                    :disabled="currentPage === 1"
                    class="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    :class="{ 'cursor-not-allowed': currentPage === 1 }"
                  >
                    <span class="sr-only">Previous</span>
                    &laquo;
                  </button>

                  <!-- Page Numbers -->
                  <template v-for="pageNum in totalPages" :key="pageNum">
                    <button
                      v-if="totalPages <= 7 || (pageNum <= 2) || (pageNum >= totalPages - 1) || (Math.abs(pageNum - currentPage) <= 1)"
                      @click="changePage(pageNum)"
                      class="px-3 py-1 rounded border"
                      :class="pageNum === currentPage
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900 text-primary-600 dark:text-primary-300 font-medium'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'"
                    >
                      {{ pageNum }}
                    </button>

                    <!-- Ellipsis -->
                    <span
                      v-else-if="(pageNum === 3 && currentPage > 4) || (pageNum === totalPages - 2 && currentPage < totalPages - 3)"
                      class="px-2 py-1 text-gray-500 dark:text-gray-400"
                    >
                      ...
                    </span>
                  </template>

                  <!-- Next Page Button -->
                  <button
                    @click="changePage(currentPage + 1)"
                    :disabled="currentPage === totalPages"
                    class="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    :class="{ 'cursor-not-allowed': currentPage === totalPages }"
                  >
                    <span class="sr-only">Next</span>
                    &raquo;
                  </button>
                </nav>
              </div>
            </div>

            <!-- In Progress Tab -->
            <div v-if="activeTab === 'inProgress'">
              <div v-if="inProgressCourses.length" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <CourseCard
                  v-for="course in inProgressCourses"
                  :key="course.id"
                  :course="course"
                  :progress="courseProgress[course.id] || 0"
                  :is-admin="isAdmin"
                  @edit-course="editCourse"
                />
              </div>
              <div v-else class="text-gray-500 dark:text-gray-400 text-center py-8">
                You haven't started any courses yet
              </div>
            </div>

            <!-- Favorites Tab -->
            <div v-if="activeTab === 'favorites'">
              <div v-if="favoriteCourses.length" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <CourseCard
                  v-for="course in favoriteCourses"
                  :key="course.id"
                  :course="course"
                  :progress="courseProgress[course.id] || 0"
                  :is-admin="isAdmin"
                  @edit-course="editCourse"
                />
              </div>
              <div v-else class="text-gray-500 dark:text-gray-400 text-center py-8">
                You haven't favorited any courses yet
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeMount, onUnmounted, nextTick } from 'vue';
import ThemeToggle from '../../components/ThemeToggle.vue';
import UserProfile from '../../components/UserProfile.vue';
import UserManagement from '../../components/UserManagement.vue';
import AdminPanel from '../../components/AdminPanel.vue';
import RescanConfirmModal from '../../components/RescanConfirmModal.vue';
import CourseCard from '../../components/course/CourseCard.vue';
import CategoryFilterBar from '../../components/filters/CategoryFilterBar.vue';
import SearchBar from '../../components/ui/SearchBar.vue';
import TabNavigation from '../../components/ui/TabNavigation.vue';
import ConfirmationModal from '../../components/ui/ConfirmationModal.vue';
import { useRouter, useRoute } from 'vue-router';
import { useSession } from '~/composables/useSession';
import { useAccountActions } from '~/composables/useAccountActions';

const branding = useRuntimeConfig().public.branding;

// Apply auth middleware
definePageMeta({
  middleware: ['auth']
});

const router = useRouter();
const route = useRoute();
const { user, logout, isAdmin } = useSession();

// Shared account / rescan machinery (header user object, delete-account
// flow, rescan POST and the user-menu modal visibility refs).
const {
  userObject,
  showUserManagement,
  showAdminPanel,
  showDeleteConfirm,
  isDeleting,
  showRescanConfirm,
  preserveMetadata,
  deleteAccount,
  confirmRescan: runRescan
} = useAccountActions();

// Course state
const courses = ref([]);
const searchQuery = ref('');
const selectedCategory = ref('all');
const sortMode = ref('title'); // 'title' | 'newest'
const tabs = [
  { id: 'all', name: 'All Courses' },
  { id: 'inProgress', name: 'In Progress' },
  { id: 'favorites', name: 'Favorites' }
];
const activeTab = ref('all');
const inProgressCourses = ref([]);
const favoriteCourses = ref([]);
const courseProgress = ref({});

// Pagination state
const currentPage = ref(1);
const pageSize = ref(9);
const totalPages = ref(0);

// Category state
const categories = ref([]);
const categoryCounts = ref({});

// Category colors - initialize with empty object
const categoryColors = ref({});

// Assign a stable color to every known category, preserving colors already
// chosen in earlier sessions (persisted to localStorage by the deep watcher
// on categoryColors below).
const assignCategoryColors = (categoryList) => {
  try {
    // Load or generate category colors
    const savedColors = localStorage.getItem('categoryColors');
    let existingCategoryColors = {};

    if (savedColors) {
      try {
        existingCategoryColors = JSON.parse(savedColors);
      } catch (e) {
        console.error('Error parsing saved category colors:', e);
        // Continue with empty object if parse fails
      }
    }

    // Define available colors
    const colors = [
      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
      'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
    ];

    // Create a new object for categoryColors to avoid reference issues
    const newCategoryColors = { ...existingCategoryColors };

    // Check for new categories and assign colors
    let colorIndex = Object.keys(newCategoryColors).length;
    categoryList.forEach(category => {
      // Only assign a color if this category doesn't already have one
      if (!newCategoryColors[category]) {
        newCategoryColors[category] = colors[colorIndex % colors.length];
        colorIndex++;
      }
    });

    // Update the reactive ref with the new object
    categoryColors.value = newCategoryColors;
  } catch (colorError) {
    console.error('Error handling category colors:', colorError);
    // Don't let color handling errors break the whole function
  }
};

// Monotonic token so a slow response from a superseded request can never
// overwrite the state written by a newer one.
let fetchCoursesToken = 0;

// Function to fetch courses with pagination
const fetchCourses = async (forceFresh = false) => {
  // First check if we need to wait for initial scan
  if (!initialScan.value.complete && !initialScan.value.error) {
    checkScanStatus();
    return;
  }

  const requestToken = ++fetchCoursesToken;
  try {
    // Build query parameters including category and search filters
    const queryParams = new URLSearchParams({
      page: currentPage.value.toString(),
      limit: pageSize.value.toString()
    });

    // Add category filter if not 'all'
    if (selectedCategory.value !== 'all') {
      queryParams.append('category', selectedCategory.value);
    }

    // Add search filter if present
    if (searchQuery.value) {
      queryParams.append('search', searchQuery.value);
    }

    if (sortMode.value && sortMode.value !== 'title') {
      queryParams.append('sort', sortMode.value);
    }

    // Add cache busting parameter if forceFresh is true
    if (forceFresh) {
      queryParams.append('_t', Date.now().toString());
    }

    // Update URL with current filters and pagination state
    router.replace({ query: Object.fromEntries(queryParams) });

    // Fetch courses from API
    const response = await $fetch(`/api/courses?${queryParams.toString()}`);

    // Ignore responses from stale requests
    if (requestToken !== fetchCoursesToken) return;

    // Handle the paginated response
    if (response) {
      courses.value = response.items || [];
      totalPages.value = response.totalPages || 0;

      // Update category counts from API response
      if (response.categoryCounts) {
        categoryCounts.value = response.categoryCounts;

        // Update the categories list from the counts
        categories.value = Object.keys(response.categoryCounts)
          .filter(cat => cat !== 'all')
          .sort();

        assignCategoryColors(categories.value);
      }

      // After courses are loaded, fetch progress data if any exist
      if (courses.value.length > 0) {
        fetchUserProgress(forceFresh);
      }
    } else {
      courses.value = [];
      totalPages.value = 0;
    }
  } catch (error) {
    if (requestToken !== fetchCoursesToken) return;
    console.error('Failed to fetch courses:', error);
    courses.value = [];
  }
};

// Handle page change
const changePage = (newPage) => {
  if (newPage >= 1 && newPage <= totalPages.value) {
    currentPage.value = newPage;
    fetchCourses();
  }
};

// Course editor state
const showCourseEditor = ref(false);
const currentCourse = ref(null);
const isSavingCourse = ref(false);

// Edit course handler
const editCourse = async (course) => {
  try {
    // First set the editor state to open - do this before fetching data
    // to ensure Vue's reactivity system properly handles the component mounting
    currentCourse.value = { ...course }; // Use a copy of the course initially
    showCourseEditor.value = true;

    // Use nextTick to ensure the component is mounted before updating with fresh data
    await nextTick();

    // Now fetch the latest course data to ensure we have up-to-date information
    // including the most recent updated_at timestamp for cache busting
    currentCourse.value = await $fetch(`/api/courses/${course.id}?t=${Date.now()}`);
  } catch (error) {
    console.error('Error in editCourse:', error);
    // The initial copy is already set, so we don't need to do anything here
  }
};

// Close course editor
const closeCourseEditor = () => {
  showCourseEditor.value = false;
  currentCourse.value = null;
};

// Save course
const saveCourse = async (courseData, done) => {
  isSavingCourse.value = true;
  try {
    // Authorization rides on the session cookie; no header to set here.
    const response = await $fetch('/api/courses/edit', {
      method: 'POST',
      body: courseData
    });

    if (response.success) {
      closeCourseEditor();

      // Force fetch with fresh data
      await fetchCourses(true);
    } else {
      alert('Error saving course: ' + response.message);
    }
  } catch (error) {
    console.error('Error saving course:', error);
    alert('Error saving course: ' + (error.message || 'Unknown error'));
  } finally {
    isSavingCourse.value = false;
    done?.();
  }
};

// Course scanning status
const pageJustLoaded = ref(true);
const initialScan = ref({
  inProgress: true, // Start by assuming scan is in progress
  complete: false,
  totalCourses: 0,
  processedCourses: 0,
  startTime: null,
  endTime: null,
  error: null,
  timestamp: null
});

// Computed property to show loading indicator
const showLoadingIndicator = computed(() => {
  return (initialScan.value.inProgress && initialScan.value.totalCourses > 0) || pageJustLoaded.value;
});

// Computed for progress percentage
const getScanProgressPercent = computed(() => {
  if (initialScan.value.totalCourses === 0) return 0;
  return Math.round((initialScan.value.processedCourses / initialScan.value.totalCourses) * 100);
});

// Single polling chain: the pending timer handle is stored so each new
// chain cancels the previous one, and unmount clears whatever is pending.
let scanPollTimer = null;

// Function to check scan status
const checkScanStatus = async () => {
  if (scanPollTimer) {
    clearTimeout(scanPollTimer);
    scanPollTimer = null;
  }
  try {
    const response = await $fetch('/api/status/scan', {
      // Add a cache busting parameter to prevent browser caching
      params: { _t: Date.now() }
    });

    // Update scan status
    initialScan.value = response;

    // No longer just loaded after first status check
    if (pageJustLoaded.value) {
      // Only show the loading indicator briefly if no scan is in progress
      if (!response.inProgress) {
        pageJustLoaded.value = false;
      } else {
        // Keep the page in loading state for at least 500ms to avoid flashing
        setTimeout(() => {
          pageJustLoaded.value = false;
        }, 500);
      }
    }

    // If scan is still in progress, check again after a short delay
    if (response.inProgress) {
      // Check more frequently for smoother progress updates
      scanPollTimer = setTimeout(checkScanStatus, 250);
    } else if (response.complete) {
      // Fetch courses with pagination
      await fetchCourses(true);
    }
  } catch (error) {
    console.error('Error checking scan status:', error);
    initialScan.value.error = error.message || 'Failed to check scan status';
    initialScan.value.inProgress = false;
    pageJustLoaded.value = false;
  }
};

// Function to retry scan if there was an error
const retryScan = async () => {
  try {
    // Reset error state
    initialScan.value.error = null;
    initialScan.value.inProgress = true;

    // Call API to restart scan
    await $fetch('/api/courses/rescan', { method: 'POST' });

    // Start checking status again
    checkScanStatus();
  } catch (error) {
    console.error('Error restarting scan:', error);
    initialScan.value.error = 'Failed to restart scan';
    initialScan.value.inProgress = false;
  }
};

// Function to start database rescan
const startRescan = async () => {
  // Show confirmation dialog instead of immediately starting rescan
  showRescanConfirm.value = true;
};

// Function to confirm and execute the rescan
const confirmRescan = async () => {
  // Reset scan status indicators
  initialScan.value = {
    inProgress: true,
    complete: false,
    totalCourses: 0,
    processedCourses: 0,
    startTime: Date.now(),
    endTime: null,
    error: null,
    timestamp: Date.now()
  };

  // Trigger the rescan API with metadata preference, then start polling
  if (await runRescan()) {
    await checkScanStatus();
  }
};

// Add a function to fetch user progress data separately
const fetchUserProgress = async (forceRefresh = false) => {
  if (!user.value || !user.value.id) {
    return;
  }

  if (courses.value.length === 0) {
    return;
  }

  try {
    // Add cache-busting parameter and force refresh option
    const cacheBuster = forceRefresh ? Date.now() : null;
    const progressData = await $fetch(`/api/user-progress/${user.value.id}${cacheBuster ? `?_t=${cacheBuster}` : ''}`);

    if (progressData && progressData.progress) {
      // Process progress data
      const userProgress = progressData.progress;

      // Extract course progress percentages for the main courses list view
      for (const courseId in userProgress) {
        if (userProgress[courseId]) {
          // Calculate overall progress percentage
          let totalVideos = 0;
          let completedVideos = 0;

          // First, find the matching course to get actual video count
          const course = courses.value.find(c => c.id === courseId);
          if (course) {
            // Count all videos in the course for accurate denominator
            course.lessons?.forEach(lesson => {
              if (lesson.videos) {
                totalVideos += lesson.videos.length;
              }
            });

            // Now count completed videos
            if (userProgress[courseId].completed) {
              const completedMap = userProgress[courseId].completed;
              for (const videoId in completedMap) {
                if (completedMap[videoId]) {
                  completedVideos++;
                }
              }
            }

            if (totalVideos > 0) {
              const progressPercent = Math.min((completedVideos / totalVideos) * 100, 100);
              courseProgress.value[courseId] = Math.round(progressPercent);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching user progress:', error);
  }

  // Now fetch specific course lists via dedicated endpoints
  await fetchFavoriteCourses(forceRefresh);
  await fetchInProgressCourses(forceRefresh);
};

// New function to fetch ALL favorite courses for a user
const fetchFavoriteCourses = async (forceRefresh = false) => {
  if (!user.value || !user.value.id) {
    return;
  }

  try {
    const cacheBuster = forceRefresh ? Date.now() : null;
    const response = await $fetch(`/api/user-favorites/${user.value.id}${cacheBuster ? `?_t=${cacheBuster}` : ''}`);

    if (response && response.success) {
      favoriteCourses.value = response.favorites || [];
    } else {
      console.error('Failed to fetch favorites:', response?.error || 'Unknown error');
      favoriteCourses.value = [];
    }
  } catch (error) {
    console.error('Error fetching favorite courses:', error);
    favoriteCourses.value = [];
  }
};

// New function to fetch ALL in-progress courses for a user
const fetchInProgressCourses = async (forceRefresh = false) => {
  if (!user.value || !user.value.id) {
    return;
  }

  try {
    const cacheBuster = forceRefresh ? Date.now() : null;
    const response = await $fetch(`/api/user-progress-courses/${user.value.id}${cacheBuster ? `?_t=${cacheBuster}` : ''}`);

    if (response && response.success) {
      inProgressCourses.value = response.inProgress || [];

      // Copy progress percentages to the main courseProgress object
      inProgressCourses.value.forEach(course => {
        if (course.progressPercentage !== undefined) {
          courseProgress.value[course.id] = course.progressPercentage;
        }
      });
    } else {
      console.error('Failed to fetch in-progress courses:', response?.error || 'Unknown error');
      inProgressCourses.value = [];
    }
  } catch (error) {
    console.error('Error fetching in-progress courses:', error);
    inProgressCourses.value = [];
  }
};

// Watch for changes to category colors and save them
watch(categoryColors, () => {
  localStorage.setItem('categoryColors', JSON.stringify(categoryColors.value));
}, { deep: true });

// Add watchers to reload courses when filters change
watch(selectedCategory, () => {
  currentPage.value = 1; // Reset to first page when changing category
  fetchCourses();
});

watch(sortMode, () => {
  currentPage.value = 1;
  fetchCourses();
});

watch(searchQuery, () => {
  // Debounce the search input to avoid too many API calls
  if (searchDebounceTimeout.value) clearTimeout(searchDebounceTimeout.value);

  searchDebounceTimeout.value = setTimeout(() => {
    currentPage.value = 1; // Reset to first page when searching
    fetchCourses();
  }, 300); // 300ms debounce
});

// Add searchDebounceTimeout variable
const searchDebounceTimeout = ref(null);

// Watch for tab changes to refresh tab-specific data
watch(() => activeTab.value, (newTab) => {
  if (newTab === 'favorites' || newTab === 'inProgress') {
    // Force a progress refresh when switching to a progress-backed tab
    fetchUserProgress(true);
  }
}, { immediate: true });

// Run this as soon as the component is created (before mount)
onBeforeMount(async () => {
  // Read pagination and filter parameters from URL

  // Set page from URL if exists
  const pageParam = parseInt(route.query.page);
  if (!Number.isNaN(pageParam)) {
    currentPage.value = pageParam;
  }

  // Set category from URL if exists
  if (route.query.category) {
    selectedCategory.value = String(route.query.category);
  }

  // Set search query from URL if exists
  if (route.query.search) {
    searchQuery.value = String(route.query.search);
  }

  if (route.query.sort === 'newest') sortMode.value = 'newest';

  // Check scan status first thing
  await checkScanStatus();
});

onUnmounted(() => {
  if (scanPollTimer) {
    clearTimeout(scanPollTimer);
    scanPollTimer = null;
  }
  if (searchDebounceTimeout.value) clearTimeout(searchDebounceTimeout.value);
});
</script>
