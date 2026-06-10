<template>
  <div class="course-editor">
    <form @submit.prevent="handleSubmit" class="space-y-6">
      <!-- Course ID (Read-only if editing) -->
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label for="courseId" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Course ID
          </label>
          <input 
            type="text" 
            id="courseId" 
            v-model="formData.id"
            :readonly="isEditing"
            :class="{'bg-gray-100 dark:bg-gray-700': isEditing}"
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
            placeholder="e.g. my-course-name"
            required
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Used for URL and file paths, no spaces or special characters except hyphens.
          </p>
        </div>

        <div>
          <label for="courseCategory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Category
          </label>
          <div class="relative">
            <input 
              type="text" 
              id="courseCategory" 
              v-model="formData.category"
              @input="filterCategories"
              @focus="showCategoryDropdown = formData.category && filteredCategories.length > 0"
              @blur="handleCategoryBlur"
              class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
              placeholder="e.g. Programming"
              required
            />
            <div v-if="showCategoryDropdown && filteredCategories.length > 0" class="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg w-full mt-1 max-h-48 overflow-y-auto">
              <ul>
                <li v-for="category in filteredCategories" :key="category" @click="selectCategory(category)" class="py-2 px-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                  {{ category }}
                </li>
              </ul>
            </div>
          </div>
          <div
            v-if="isEditing && categorySuggestions.length > 0"
            class="mt-2 flex flex-wrap items-center gap-2"
          >
            <span class="text-xs text-gray-500 dark:text-gray-400">Suggested:</span>
            <button
              v-for="suggestion in categorySuggestions"
              :key="suggestion"
              type="button"
              @click="formData.category = suggestion"
              class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 hover:bg-primary-200 dark:bg-primary-900 dark:text-primary-200 dark:hover:bg-primary-800 transition-colors"
              :aria-label="`Set category to ${suggestion}`"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>
      </div>

      <!-- Course Title and Description -->
      <div>
        <label for="courseTitle" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Title
        </label>
        <input 
          type="text" 
          id="courseTitle" 
          v-model="formData.title"
          class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
          placeholder="Course title"
          required
        />
      </div>

      <div>
        <label for="courseDescription" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description
        </label>
        <textarea 
          id="courseDescription" 
          v-model="formData.description"
          rows="3"
          class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
          placeholder="Course description"
          required
        ></textarea>
      </div>

      <!-- Thumbnail -->
      <div>
        <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Thumbnail
        </h3>
        <div class="mt-1 flex items-stretch space-x-4">
          <div class="w-32 h-24 shrink-0 bg-gray-100 dark:bg-gray-700 overflow-hidden rounded-md">
            <img
              v-if="thumbnailPreview"
              :src="thumbnailPreview"
              alt="Course thumbnail"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <img
                :src="`/images/placeholder.png?t=${Date.now()}`"
                alt="Default thumbnail"
                class="w-full h-full object-cover"
              />
            </div>
          </div>

          <div
            data-testid="thumbnail-dropzone"
            role="button"
            tabindex="0"
            aria-label="Upload course thumbnail"
            :aria-invalid="!!uploadError"
            aria-describedby="thumbnail-help thumbnail-error-text"
            class="flex-1 flex flex-col items-center justify-center cursor-pointer rounded-md border-2 border-dashed transition-colors px-4 py-6 text-center select-none"
            :class="[
              uploadError ? 'border-red-400 dark:border-red-500' : isDragging
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
            ]"
            @click="openFilePicker"
            @keydown="onZoneKeydown"
            @dragenter="onDragEnter"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12m4.5-4.5V21" />
            </svg>
            <p class="text-sm text-gray-700 dark:text-gray-200">
              <span class="font-medium">Drop an image here</span> or click to browse
            </p>
            <p id="thumbnail-help" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Recommended size: 480 × 270 px
            </p>
            <input
              ref="fileInputRef"
              id="thumbnailUpload"
              type="file"
              accept="image/*"
              class="hidden"
              @click.stop
              @change="handleThumbnailUpload"
            />
          </div>
        </div>
        <p
          id="thumbnail-error-text"
          v-if="uploadError"
          data-testid="thumbnail-upload-error"
          role="alert"
          class="mt-2 text-sm text-red-500 dark:text-red-400"
        >
          {{ uploadError }}
        </p>
      </div>

      <!-- Release Date -->
      <div>
        <label for="releaseDate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Release Date
        </label>
        <div class="flex items-center">
          <input 
            type="date" 
            id="releaseDate" 
            v-model="formData.releaseDate"
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-xs focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
          />
          <button 
            type="button" 
            @click="formData.releaseDate = ''" 
            class="ml-2 inline-flex items-center p-2 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            title="Clear date"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave empty to hide release date on course card</p>
      </div>

      <!-- course.json banner -->
      <div
        v-if="hasJson"
        data-testid="course-json-banner"
        class="rounded border border-yellow-600 bg-yellow-900/20 text-yellow-200 text-sm px-3 py-2"
      >
        <strong>course.json detected.</strong>
        This course has a JSON override on disk. Saving here updates only the
        database; click <em>Export to course.json</em> to also write the JSON,
        otherwise the next rescan will revert your edits.
      </div>

      <!-- Submit buttons -->
      <div class="flex flex-wrap justify-between items-center gap-3">
        <div>
          <button
            v-if="isEditing"
            type="button"
            data-testid="course-export-json"
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            :disabled="exportingThisCourse"
            @click="exportThisCourseJson"
          >
            {{ exportingThisCourse ? 'Exporting…' : 'Export to course.json' }}
          </button>
          <p
            v-if="exportError"
            data-testid="course-export-error"
            role="alert"
            class="mt-2 text-sm text-red-500 dark:text-red-400"
          >
            {{ exportError }}
          </p>
        </div>
        <div class="flex space-x-4">
          <button
            type="button"
            @click="$emit('cancel')"
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-xs text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 border border-transparent rounded-md shadow-xs text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            :disabled="isSaving"
          >
            {{ isSaving ? 'Saving...' : 'Save Course' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { findMatchingCategories } from '~/utils/categoryMatching.js';

const props = defineProps({
  course: {
    type: Object,
    default() {
      return {};
    }
  }
});

const emit = defineEmits(['save', 'cancel']);

const isSaving = ref(false);
const hasJson = ref(false);
const exportingThisCourse = ref(false);

async function probeHasJson(courseId) {
  if (!courseId) {
    hasJson.value = false;
    return;
  }
  try {
    const res = await $fetch(`/api/courses/${encodeURIComponent(courseId)}/has-json`);
    hasJson.value = !!res?.hasJson;
  } catch {
    hasJson.value = false;
  }
}

// Build the FormData payload shared by the save and export flows.
function buildCourseFormData() {
  const data = new FormData();
  data.append('course', JSON.stringify({
    id: formData.value.id,
    title: formData.value.title,
    description: formData.value.description,
    category: formData.value.category,
    releaseDate: formData.value.releaseDate
  }));
  if (formData.value.thumbnail) {
    data.append('thumbnail', formData.value.thumbnail);
  }
  return data;
}

async function exportThisCourseJson() {
  if (!formData.value.id) return;
  exportingThisCourse.value = true;
  exportError.value = '';
  try {
    // Save first so the exported JSON reflects the form's current values.
    const saveRes = await $fetch('/api/courses/edit', { method: 'POST', body: buildCourseFormData() });
    if (!saveRes?.success) {
      console.error('Save before export failed:', saveRes);
      exportError.value = saveRes?.message || 'Save before export failed.';
      return;
    }
    await $fetch(`/api/courses/${encodeURIComponent(formData.value.id)}/export-json`, {
      method: 'POST',
    });
    hasJson.value = true;
  } catch (err) {
    console.error('Export failed:', err);
    exportError.value = err?.data?.statusMessage || err?.statusMessage || err?.message || 'Export failed.';
  } finally {
    exportingThisCourse.value = false;
  }
}
const thumbnailPreview = ref('');
const exportError = ref('');

// Dropzone state
const isDragging = ref(false);
const dragDepth = ref(0); // counter to handle dragleave firing on children
const uploadError = ref('');
const fileInputRef = ref(null);
let errorTimer = null;
let lastObjectUrl = null;
function revokeLastObjectUrl() {
  if (lastObjectUrl) {
    try { URL.revokeObjectURL(lastObjectUrl); } catch {}
    lastObjectUrl = null;
  }
}

const ACCEPTED_PREFIXES = ['image/'];
const SOFT_SIZE_WARN = 10 * 1024 * 1024; // 10 MB — server enforces hard limit

function showError(msg) {
  uploadError.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { uploadError.value = ''; }, 3000);
}

function fileLooksLikeImage(file) {
  if (!file || !file.type) return false;
  return ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p));
}

function applyImageFile(file) {
  if (!fileLooksLikeImage(file)) {
    showError('Image files only.');
    return;
  }
  // Clear any prior error now that we have a valid image. The size warning
  // below (if any) replaces it via showError.
  uploadError.value = '';
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
  if (file.size > SOFT_SIZE_WARN) {
    showError('Warning: file is larger than 10 MB and may be rejected by the server.');
  }
  revokeLastObjectUrl();
  const url = URL.createObjectURL(file);
  lastObjectUrl = url;
  thumbnailPreview.value = url;
  formData.value.thumbnail = file;
}

function onDragEnter(event) {
  event.preventDefault();
  dragDepth.value += 1;
  isDragging.value = true;
}

function onDragOver(event) {
  // Required so the browser will fire `drop`
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave(event) {
  event.preventDefault();
  dragDepth.value = Math.max(0, dragDepth.value - 1);
  if (dragDepth.value === 0) isDragging.value = false;
}

function onDrop(event) {
  event.preventDefault();
  dragDepth.value = 0;
  isDragging.value = false;

  const dt = event.dataTransfer;
  if (!dt) return;

  // Reject folders (FileSystemEntry returns isDirectory=true)
  const items = dt.items ? Array.from(dt.items) : [];
  for (const item of items) {
    if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry && entry.isDirectory) {
        showError('Folders are not supported. Drop a single image file.');
        return;
      }
    }
  }
  const itemsCanDetectFolders = items.length > 0 && items.some(
    (it) => it.kind === 'file' && typeof it.webkitGetAsEntry === 'function',
  );
  if (items.length > 0 && !itemsCanDetectFolders) {
    showError('Drop unsupported in this browser; click to choose an image.');
    return;
  }

  const files = dt.files ? Array.from(dt.files) : [];
  if (files.length === 0) return;
  if (files.length > 1) {
    showError('Drop a single image file.');
    return;
  }
  applyImageFile(files[0]);
}

function openFilePicker() {
  if (fileInputRef.value) fileInputRef.value.click();
}

function onZoneKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openFilePicker();
  }
}

// Add state for category autocomplete
const availableCategories = ref([]);
const filteredCategories = ref([]);
const showCategoryDropdown = ref(false);

// Form state
const isEditing = computed(() => !!props.course.id);
const formData = ref({
  id: '',
  title: '',
  description: '',
  category: '',
  thumbnail: null,
  releaseDate: ''
});

const categorySuggestions = computed(() =>
  findMatchingCategories(
    formData.value.title,
    availableCategories.value,
    { currentCategory: formData.value.category }
  )
);

// Reset form to empty values
const resetForm = () => {
  revokeLastObjectUrl();
  formData.value = {
    id: '',
    title: '',
    description: '',
    category: '',
    thumbnail: null,
    releaseDate: ''
  };
  thumbnailPreview.value = '';
};

// Handle thumbnail upload
const handleThumbnailUpload = (event) => {
  const file = event.target.files[0];
  if (file) applyImageFile(file);
};

// Handle form submission. The parent owns the actual POST; it invokes the
// `done` callback when the request settles so the Saving… state clears even
// when the save fails and the editor stays open.
const handleSubmit = async () => {
  if (isSaving.value) return;

  // Normalize id if not editing
  if (!isEditing.value) {
    formData.value.id = formData.value.id
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  isSaving.value = true;
  try {
    await new Promise((resolve) => emit('save', buildCourseFormData(), resolve));
  } finally {
    isSaving.value = false;
  }
};

// Fetch available categories when component mounts
onMounted(async () => {
  try {
    availableCategories.value = await $fetch('/api/categories');
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
});

// Watch for course changes to initialize form (single init path — fires
// immediately on mount and whenever the parent replaces the prop wholesale)
watch(() => props.course, (newCourse) => {
  if (newCourse && newCourse.id) {
    formData.value.id = newCourse.id;
    probeHasJson(newCourse.id);
    formData.value.title = newCourse.title;
    formData.value.description = newCourse.description;
    formData.value.category = newCourse.category || ''; // Handle potential null/undefined
    formData.value.releaseDate = newCourse.releaseDate ? newCourse.releaseDate.substring(0, 10) : '';
    formData.value.thumbnail = null; // Reset file input

    // Construct thumbnail preview URL with cache busting. Thumbnails are
    // always stored under the standardized thumbnail.png name and served
    // from /api/content/<courseId>/thumbnail.png.
    if (newCourse.thumbnail) {
      // Use updated_at timestamp for cache busting if available, otherwise use Date.now()
      const cacheBuster = newCourse.updated_at ? new Date(newCourse.updated_at).getTime() : Date.now();
      thumbnailPreview.value = `/api/content/${encodeURIComponent(newCourse.id)}/thumbnail.png?v=${cacheBuster}`;
    } else {
      thumbnailPreview.value = ''; // No existing thumbnail
    }
  } else {
    // Reset form if course prop is empty or invalid
    resetForm();
    hasJson.value = false;
  }
}, { immediate: true });

// Watch for category input changes to filter dropdown options
const filterCategories = () => {
  const query = formData.value.category.toLowerCase();
  filteredCategories.value = availableCategories.value
    .filter(category => category.toLowerCase().includes(query));
  
  // Show dropdown if we have matching categories and input is not empty
  showCategoryDropdown.value = formData.value.category.length > 0 && filteredCategories.value.length > 0;
};

// Method to select a category from dropdown
const selectCategory = (category) => {
  formData.value.category = category;
  showCategoryDropdown.value = false;
};

// Handle category blur event
const handleCategoryBlur = () => {
  setTimeout(() => {
    showCategoryDropdown.value = false;
  }, 200);
};

onUnmounted(() => {
  revokeLastObjectUrl();
  if (errorTimer) clearTimeout(errorTimer);
});
</script>
