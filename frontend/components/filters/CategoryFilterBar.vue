<template>
  <div>
    <div class="flex flex-wrap gap-2 mb-4">
      <button 
        @click="$emit('select-category', 'all')" 
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="selectedCategory === 'all' ? 'bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 ring-2 ring-primary-500' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'"
      >
        All ({{ categoryCounts['all'] || 0 }})
      </button>
      <button 
        v-for="category in categories" 
        :key="category"
        @click="$emit('select-category', category)"
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="[
          selectedCategory === category ? 'ring-2 ring-offset-1' : 'hover:bg-opacity-90',
          categoryColors[category] ? categoryColors[category] : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        ]"
      >
        {{ category }} ({{ categoryCounts[category] || 0 }})
      </button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  /**
   * List of available categories to display as filter options
   */
  categories: {
    type: Array,
    required: true
  },
  
  /**
   * Currently selected category
   */
  selectedCategory: {
    type: String,
    default: 'all'
  },
  
  /**
   * Object containing the count of courses for each category
   * Example: { 'all': 15, 'javascript': 5, 'python': 10 }
   */
  categoryCounts: {
    type: Object,
    default: () => ({})
  },
  
  /**
   * Object containing the styling classes for each category
   * Example: { 'javascript': 'bg-yellow-100 text-yellow-800', 'python': 'bg-blue-100 text-blue-800' }
   */
  categoryColors: {
    type: Object,
    default: () => ({})
  }
});

/**
 * Emit events when a category is selected
 * @event select-category - Emitted when a category button is clicked with the category name as payload
 */
defineEmits(['select-category']);
</script>
