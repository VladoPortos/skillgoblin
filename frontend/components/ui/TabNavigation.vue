<template>
  <div class="px-4 sm:px-0 border-b border-gray-200 dark:border-gray-700">
    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="$emit('select-tab', tab.id)"
        class="py-4 px-1 border-b-2 font-medium text-sm"
        :class="activeTab === tab.id ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'"
      >
        {{ tab.name }}
      </button>
    </nav>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  /**
   * Array of tab objects to display
   * Each tab should have at least an id and name property
   * Example: [{ id: 'all', name: 'All Courses' }, { id: 'favorites', name: 'Favorites' }]
   */
  tabs: {
    type: Array,
    required: true,
    validator: (value) => {
      // Ensure each tab has at least id and name properties
      return value.every(tab => tab.id !== undefined && tab.name !== undefined);
    }
  },
  
  /**
   * Currently active tab ID
   */
  activeTab: {
    type: String,
    required: true
  }
});

/**
 * Emit events when a tab is selected
 * @event select-tab - Emitted when a tab button is clicked with the tab ID as payload
 */
defineEmits(['select-tab']);
</script>
