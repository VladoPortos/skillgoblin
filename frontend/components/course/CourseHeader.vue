<template>
  <header class="bg-white dark:bg-gray-800 shadow">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
      <div class="flex items-center">
        <button @click="navigateBack" class="mr-4 flex-shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
        <div class="flex items-center mr-4">
          <img src="/logos/skillgoblin-logo-square.png" alt="SkillGoblin Logo" class="w-6 h-6 mr-2 hidden sm:block" />
          <span class="text-sm font-medium text-gray-900 dark:text-white hidden sm:block">SkillGoblin</span>
        </div>
        <h1 class="text-xl font-bold text-gray-900 dark:text-white truncate max-w-[140px] sm:max-w-xs md:max-w-md">{{ course?.title || 'Loading...' }}</h1>
        <!-- Course Progress Indicator -->
        <div v-if="course && totalVideos > 0" class="ml-4 flex items-center">
          <div class="relative h-10 w-10 flex-shrink-0">
            <!-- Background circle -->
            <svg class="h-10 w-10" viewBox="0 0 36 36">
              <circle 
                cx="18" cy="18" r="15.5" 
                fill="none" 
                stroke-width="3" 
                class="stroke-gray-200 dark:stroke-gray-700"
              />
              <!-- Progress circle -->
              <circle 
                cx="18" cy="18" r="15.5" 
                fill="none" 
                stroke-width="3" 
                stroke-dasharray="97.5" 
                :stroke-dashoffset="97.5 - (97.5 * courseCompletionPercentage / 100)"
                stroke-linecap="round" 
                class="stroke-blue-500 dark:stroke-blue-400"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <!-- Percentage text -->
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-xs font-medium text-gray-900 dark:text-white">{{ Math.round(courseCompletionPercentage) }}%</span>
            </div>
          </div>
          <span class="ml-2 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{{ completedVideosCount }} / {{ totalVideos }}</span>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <button 
          @click="$emit('toggle-favorite')"
          class="p-1 rounded-full text-gray-400 hover:text-yellow-500"
          :class="{ 'text-yellow-500': isFavorite }"
          title="Add to favorites"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
        <button 
          @click="$emit('mark-completed')"
          class="p-1 rounded-full text-gray-400 hover:text-green-500"
          title="Mark course as completed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
        </button>
        <button 
          @click="$emit('reset-progress')"
          class="p-1 rounded-full text-gray-400 hover:text-red-500"
          title="Reset course progress"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
          </svg>
        </button>
        <UserProfile 
          :user="user" 
          @logout="$emit('logout')" 
          @delete="navigateBack"
        />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router';
import ThemeToggle from '../ThemeToggle.vue';
import UserProfile from '../UserProfile.vue';

// Setup router for navigation
const router = useRouter();

// Define props
const props = defineProps({
  course: {
    type: Object,
    required: true
  },
  totalVideos: {
    type: Number,
    default: 0
  },
  completedVideosCount: {
    type: Number,
    default: 0
  },
  courseCompletionPercentage: {
    type: Number,
    default: 0
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    required: true
  }
});

// Define emitted events
const emit = defineEmits(['toggle-favorite', 'mark-completed', 'reset-progress', 'logout']);

// Navigation method
function navigateBack() {
  router.push('/courses');
}
</script>
