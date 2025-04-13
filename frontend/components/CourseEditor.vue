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
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
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
              class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
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
          class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
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
          class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
          placeholder="Course description"
          required
        ></textarea>
      </div>

      <!-- Thumbnail -->
      <div>
        <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Thumbnail
        </h3>
        <div class="mt-1 flex items-center space-x-4">
          <div class="w-32 h-24 bg-gray-100 dark:bg-gray-700 overflow-hidden rounded-md">
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
          <div class="flex flex-col items-start space-y-2">
            <label for="thumbnailUpload" class="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
              <span>Upload image</span>
              <input 
                id="thumbnailUpload" 
                type="file" 
                @change="handleThumbnailUpload" 
                accept="image/*" 
                class="hidden"
              />
            </label>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Recommended size: 480x270px
            </p>
          </div>
        </div>
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
            class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-800 dark:text-white sm:text-sm px-3 py-2"
          />
          <button 
            type="button" 
            @click="formData.releaseDate = ''" 
            class="ml-2 inline-flex items-center p-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            title="Clear date"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave empty to hide release date on course card</p>
      </div>

      <!-- Submit buttons -->
      <div class="flex justify-end space-x-4">
        <button 
          type="button"
          @click="$emit('cancel')"
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button 
          type="submit"
          class="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          :disabled="isSaving"
        >
          {{ isSaving ? 'Saving...' : 'Save Course' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

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
const thumbnailPreview = ref('');
const thumbnailFile = ref(null);

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

// Initialize form with course data
const initializeForm = (course) => {
  formData.value = {
    id: course.id || '',
    title: course.title || '',
    description: course.description || '',
    category: course.category || '',
    thumbnail: null,
    releaseDate: course.releaseDate || ''
  };
  
  // Set thumbnail preview if available
  if (course.thumbnail) {
    // Check if it's a full URL
    if (course.thumbnail.startsWith('http')) {
      thumbnailPreview.value = course.thumbnail;
    } else if (!course.thumbnail || course.thumbnail === 'placeholder.png') {
      // Add cache-busting timestamp to prevent caching issues
      thumbnailPreview.value = `/images/placeholder.png?t=${Date.now()}`;
    } else {
      // Always use the standardized thumbnail.png name with cache-busting
      const courseId = encodeURIComponent(course.id);
      thumbnailPreview.value = `/api/content/${courseId}/thumbnail.png?t=${Date.now()}`;
    }
  } else {
    thumbnailPreview.value = '';
  }
};

// Reset form to empty values
const resetForm = () => {
  formData.value = {
    id: '',
    title: '',
    description: '',
    category: '',
    thumbnail: null,
    releaseDate: ''
  };
};

// Handle thumbnail upload
const handleThumbnailUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    thumbnailFile.value = file;
    thumbnailPreview.value = URL.createObjectURL(file);
    formData.value.thumbnail = file;
  }
};

// Handle form submission
const handleSubmit = () => {
  // Create FormData object for submission
  const data = new FormData();
  
  // Normalize id if not editing
  if (!isEditing.value) {
    formData.value.id = formData.value.id
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }
  
  // Add course data as JSON string
  const courseData = {
    id: formData.value.id,
    title: formData.value.title,
    description: formData.value.description,
    category: formData.value.category,
    releaseDate: formData.value.releaseDate
  };
  
  data.append('course', JSON.stringify(courseData));
  
  // Add thumbnail file if selected
  if (formData.value.thumbnail) {
    data.append('thumbnail', formData.value.thumbnail);
  }
  
  // Emit save event with form data
  emit('save', data);
};

// Fetch available categories when component mounts
onMounted(async () => {
  try {
    const categories = await fetch('/api/categories').then(res => res.json());
    availableCategories.value = categories;
  } catch (error) {
    console.error('Error fetching categories:', error);
  }
  
  // Initialize form with course data
  if (props.course.id) {
    initializeForm(props.course);
  } else {
    resetForm();
  }
});

// Watch for course changes to initialize form
watch(() => props.course, (newCourse) => {
  if (newCourse && newCourse.id) {
    formData.value.id = newCourse.id;
    formData.value.title = newCourse.title;
    formData.value.description = newCourse.description;
    formData.value.category = newCourse.category || ''; // Handle potential null/undefined
    formData.value.releaseDate = newCourse.releaseDate ? newCourse.releaseDate.substring(0, 10) : '';
    formData.value.thumbnail = null; // Reset file input
    thumbnailFile.value = null;

    // Construct thumbnail preview URL with cache busting
    if (newCourse.thumbnail) {
      // Use updated_at timestamp for cache busting if available, otherwise use Date.now()
      const cacheBuster = newCourse.updated_at ? new Date(newCourse.updated_at).getTime() : Date.now();
      thumbnailPreview.value = `/api/content/${newCourse.id}/${newCourse.thumbnail}?v=${cacheBuster}`;
    } else {
      thumbnailPreview.value = ''; // No existing thumbnail
    }

    console.log("CourseEditor initialized with:", JSON.stringify(formData.value));
    console.log("Thumbnail preview URL:", thumbnailPreview.value);

  } else {
    // Reset form if course prop is empty or invalid
    resetForm();
  }
}, { immediate: true, deep: true });

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
</script>
