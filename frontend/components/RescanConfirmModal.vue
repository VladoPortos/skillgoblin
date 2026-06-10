<template>
  <ConfirmationModal
    title="Database Rescan"
    message="Are you sure you want to rescan the courses database?"
    confirm-button-text="Rescan Database"
    cancel-button-text="Cancel"
    :show="show"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  >
    <!-- Metadata option (using slot) -->
    <div class="mb-6">
      <div class="flex items-center mb-2">
        <input
          id="preserve-metadata"
          :checked="modelValue"
          type="checkbox"
          class="rounded text-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
          @change="$emit('update:modelValue', $event.target.checked)"
        />
        <label for="preserve-metadata" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
          Preserve course metadata (thumbnails, descriptions, etc.)
        </label>
      </div>
      <p class="text-sm text-gray-500 dark:text-gray-400 italic">
        If unchecked, all custom metadata will be reset to defaults.
      </p>
    </div>
  </ConfirmationModal>
</template>

<script setup>
import ConfirmationModal from './ui/ConfirmationModal.vue';

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  modelValue: {
    type: Boolean,
    default: true
  }
});

defineEmits(['confirm', 'cancel', 'update:modelValue']);
</script>
