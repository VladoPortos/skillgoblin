<template>
  <div 
    class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden transition-shadow hover:shadow-md relative"
  >
    <div class="relative h-40 overflow-hidden" @click="navigateToCourse">
      <img 
        v-if="thumbnailUrl" 
        :src="thumbnailUrl"
        :alt="course.title" 
        class="w-full h-full object-cover"
      />
      <div v-else class="w-full h-full flex items-center justify-center bg-primary-100 dark:bg-primary-900">
        <span class="text-primary-600 dark:text-primary-200 text-xl">{{ course.title.charAt(0) }}</span>
      </div>
      
      <!-- Admin Edit Button -->
      <div v-if="isAdmin" class="absolute top-2 right-2">
        <button 
          @click.stop="$emit('edit-course', course)"
          class="p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Edit course"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
      </div>
      
      <!-- Progress bar -->
      <div v-if="progress > 0" class="absolute bottom-0 left-0 right-0 h-2 bg-gray-300 dark:bg-gray-700">
        <div 
          class="h-full bg-green-600 dark:bg-green-500"
          :style="{ width: `${progress}%` }"
        ></div>
      </div>
    </div>
    
    <div class="p-4" @click="navigateToCourse">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white truncate">{{ course.title }}</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{{ course.description }}</p>
      
      <div class="mt-3 flex flex-wrap justify-between items-center">
        <div class="flex items-center space-x-2 mb-1">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">
            {{ course.category }}
          </span>
          
          <span 
            v-if="shouldShowReleaseDate" 
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {{ formattedReleaseDate }}
          </span>
        </div>
        
        <div v-if="progress > 0" class="text-sm text-gray-500 dark:text-gray-400">
          {{ Math.round(progress) }}% complete
        </div>
      </div>
    </div>
    
    <!-- Read More button in bottom right corner -->
    <button 
      @click.stop="showDetails = true"
      class="absolute bottom-3 right-3 p-3 rounded-full bg-primary-100 dark:bg-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors shadow-sm"
      title="Read more"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary-600 dark:text-primary-300" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
      </svg>
    </button>
    
    <!-- Course Details Modal -->
    <div 
      v-if="showDetails" 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      @click.self="showDetails = false"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        <div class="relative h-48 overflow-hidden">
          <img 
            v-if="thumbnailUrl" 
            :src="thumbnailUrl"
            :alt="course.title" 
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center bg-primary-100 dark:bg-primary-900">
            <span class="text-primary-600 dark:text-primary-200 text-3xl">{{ course.title.charAt(0) }}</span>
          </div>
          
          <!-- Close button -->
          <button 
            @click="showDetails = false"
            class="absolute top-2 right-2 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600 dark:text-gray-300" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
        
        <div class="p-6">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">{{ course.title }}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{{ course.description }}</p>
          
          <div class="flex flex-wrap items-center space-x-2 mb-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">
              {{ course.category }}
            </span>
            
            <span 
              v-if="shouldShowReleaseDate" 
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ formattedReleaseDate }}
            </span>
          </div>
          
          <div class="flex justify-end">
            <button 
              @click="navigateAndClose" 
              class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              Start Learning
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  course: {
    type: Object,
    required: true
  },
  progress: {
    type: Number,
    default: 0
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isFavorite: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['edit-course', 'toggle-favorite', 'click']);

const router = useRouter();

// State for course details modal
const showDetails = ref(false);

const thumbnailUrl = computed(() => {
  // If no thumbnail specified, use a placeholder
  if (!props.course.thumbnail) {
    // Add cache-busting timestamp to prevent caching issues
    return `/images/placeholder.png?t=${Date.now()}`;
  }
  
  // Use the new database-backed thumbnail endpoint with the course ID
  // Add cache-busting with lastUpdate timestamp or current time
  const cacheBuster = props.course.lastUpdate || Date.now();
  return `/api/course-thumbnail/${encodeURIComponent(props.course.id)}?t=${cacheBuster}`;
});

const formattedReleaseDate = computed(() => {
  // Check for empty values - be very explicit with all possibilities
  if (props.course.releaseDate === undefined || 
      props.course.releaseDate === null || 
      props.course.releaseDate === '' || 
      (typeof props.course.releaseDate === 'string' && props.course.releaseDate.trim() === '')) {
    return null;
  }
  
  try {
    const dateObj = new Date(props.course.releaseDate);
    if (isNaN(dateObj)) {
      return null;
    }
    
    // Format like "Mar 2025"
    const formatted = dateObj.toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric'
    });
    return formatted;
  } catch (e) {
    console.error('Error formatting date:', e);
    return null;
  }
});

const shouldShowReleaseDate = computed(() => {
  // This double-check ensures we don't show the date badge for empty values
  if (props.course.releaseDate === undefined || 
      props.course.releaseDate === null || 
      props.course.releaseDate === '' || 
      (typeof props.course.releaseDate === 'string' && props.course.releaseDate.trim() === '')) {
    return false;
  }
  return formattedReleaseDate.value !== null && formattedReleaseDate.value !== '';
});

function navigateToCourse() {
  router.push(`/courses/${props.course.id}`);
  // Also emit click event for parent components that need it
  emit('click', props.course);
}

function navigateAndClose() {
  showDetails.value = false;
  navigateToCourse();
}
</script>
