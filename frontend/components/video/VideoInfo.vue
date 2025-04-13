<template>
  <div class="bg-white dark:bg-gray-800 p-4 mb-6 rounded-lg shadow border-l-4 border-primary-500 dark:border-primary-400">
    <div class="flex items-center mb-2">
      <span class="text-sm font-medium text-primary-600 dark:text-primary-400 mr-2">Now Playing:</span>
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{{ video?.title || 'No video selected' }}</h2>
    </div>
    <div class="mt-2 flex items-center">
      <div class="flex items-center">
        <span 
          v-if="isCompleted" 
          class="mr-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400"
        >
          Completed
        </span>
        <span v-else-if="progressPercentage > 0" class="mr-2 text-sm text-gray-500 dark:text-gray-400">
          {{ Math.round(progressPercentage) }}% watched
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

// Props for the component
const props = defineProps({
  video: {
    type: Object,
    default: null
  },
  videoId: {
    type: String,
    default: ''
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  progressPercentage: {
    type: Number,
    default: 0
  }
});

// Computed properties
const hasVideo = computed(() => !!props.video);
</script>
