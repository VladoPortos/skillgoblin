<template>
  <div class="flex-shrink-0 flex space-x-2">
    <button 
      @click="$emit('toggle-completion')"
      class="rounded-full flex items-center justify-center w-7 h-7"
      :class="isCompleted ? 'bg-green-500 dark:bg-green-400 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'"
      title="Toggle completion status"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    </button>
    <button 
      @click="$emit('reset-progress')"
      class="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 dark:bg-red-400 text-white"
      title="Reset progress"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>
</template>

<script setup>
// Props for the component
const props = defineProps({
  isCompleted: {
    type: Boolean,
    default: false
  },
  showResetButton: {
    type: Boolean,
    default: true
  }
});

// Define emitted events
const emit = defineEmits(['toggle-completion', 'reset-progress']);
</script>
