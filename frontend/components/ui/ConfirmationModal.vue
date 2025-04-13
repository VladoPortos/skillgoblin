<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">{{ title }}</h2>
      <p class="text-gray-700 dark:text-gray-300 mb-6">
        {{ message }}
      </p>
      
      <!-- Optional slot for additional content -->
      <slot></slot>
      
      <div class="flex justify-end space-x-4">
        <button 
          @click="$emit('cancel')" 
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          {{ cancelButtonText }}
        </button>
        <button 
          @click="$emit('confirm')" 
          class="px-4 py-2"
          :class="[
            confirmButtonColor === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700',
            'text-white rounded-md'
          ]"
          :disabled="isLoading"
        >
          {{ isLoading ? loadingText : confirmButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  /**
   * Modal title
   */
  title: {
    type: String,
    required: true
  },
  
  /**
   * Modal message/content
   */
  message: {
    type: String,
    required: true
  },
  
  /**
   * Text for the confirm button
   */
  confirmButtonText: {
    type: String,
    default: 'Confirm'
  },
  
  /**
   * Text for the cancel button
   */
  cancelButtonText: {
    type: String,
    default: 'Cancel'
  },
  
  /**
   * Whether the modal is visible
   */
  show: {
    type: Boolean,
    default: false
  },
  
  /**
   * Color of the confirm button: 'primary' or 'red'
   */
  confirmButtonColor: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'red'].includes(value)
  },
  
  /**
   * Whether the confirm action is in progress
   */
  isLoading: {
    type: Boolean,
    default: false
  },
  
  /**
   * Text to display on the confirm button when loading
   */
  loadingText: {
    type: String,
    default: 'Processing...'
  }
});

/**
 * Emit events
 * @event confirm - Emitted when the confirm button is clicked
 * @event cancel - Emitted when the cancel button is clicked
 */
defineEmits(['confirm', 'cancel']);
</script>
