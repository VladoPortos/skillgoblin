<template>
  <div v-if="visible" class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <button @click="closeModal" class="close-button">&times;</button>
      <h3 v-if="courseTitle">{{ courseTitle }} - Downloadable Files</h3>
      <h3 v-else>Downloadable Files</h3>

      <div v-if="isLoading" class="loading-spinner">Loading files...</div>
      <div v-if="error" class="error-message">{{ error }}</div>

      <div v-if="!isLoading && !error && (!filesByFolder || filesByFolder.length === 0)" class="no-files">
        No supplementary files found for this course.
      </div>

      <div v-if="!isLoading && !error && filesByFolder && filesByFolder.length > 0">
        <div v-for="folderGroup in filesByFolder" :key="folderGroup.relativePathForDisplay" class="folder-group">
          <h4 @click="toggleFolder(folderGroup.relativePathForDisplay)" class="folder-header">
            <span class="icon">
              <svg v-if="expandedFolders[folderGroup.relativePathForDisplay]" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
            </span>
            {{ folderGroup.folderName }} ({{ folderGroup.files.length }} files)
          </h4>
          <ul v-if="expandedFolders[folderGroup.relativePathForDisplay]" class="file-list">
            <li v-for="file in folderGroup.files" :key="file.downloadPath" class="file-item">
              <span class="file-icon">📄</span> 
              <span class="file-name">{{ file.name }}</span>
              <span class="file-info"> ({{ file.extension.toUpperCase() }}, {{ file.formattedSize }})</span>
              <button @click="downloadFile(file.downloadPath)" class="download-button">Download</button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  courseId: String,
});

const emit = defineEmits(['close']);

const courseTitle = ref('');
const filesByFolder = ref([]);
const isLoading = ref(false);
const error = ref('');
const expandedFolders = ref({});

const closeModal = () => {
  emit('close');
};

const toggleFolder = (folderPath) => {
  expandedFolders.value[folderPath] = !expandedFolders.value[folderPath];
};

const fetchFiles = async () => {
  if (!props.courseId) return;
  isLoading.value = true;
  error.value = '';
  filesByFolder.value = [];
  expandedFolders.value = {}; 

  try {
    const response = await fetch(`/api/courses/${props.courseId}/list-files`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({ message: `Failed to fetch files (status: ${response.status})` }));
      throw new Error(errData.message || `Failed to fetch files (status: ${response.status})`);
    }
    const data = await response.json();
    if (data.success) {
      courseTitle.value = data.courseTitle;
      filesByFolder.value = data.filesByFolder;
      if (data.filesByFolder && data.filesByFolder.length > 0) {
        data.filesByFolder.forEach(fg => {
          if (fg.files && fg.files.length > 0) {
             expandedFolders.value[fg.relativePathForDisplay] = true;
          }
        });
      }
    } else {
      throw new Error(data.message || 'Failed to list files.');
    }
  } catch (e) {
    console.error('Error fetching course files:', e);
    error.value = e.message;
  } finally {
    isLoading.value = false;
  }
};

const downloadFile = (filePath) => {
  if (!props.courseId || !filePath) return;
  const downloadUrl = `/api/courses/${props.courseId}/download-file?filePath=${encodeURIComponent(filePath)}`;
  window.open(downloadUrl, '_blank');
};

watch(() => props.visible, (newVal) => {
  if (newVal && props.courseId) {
    fetchFiles();
  } else {
    courseTitle.value = '';
    filesByFolder.value = [];
    isLoading.value = false;
    error.value = '';
    expandedFolders.value = {};
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  color: #333;
  padding: 25px;
  border-radius: 8px;
  width: 80%;
  max-width: 700px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 15px rgba(0,0,0,0.2);
  position: relative;
  /* Dark mode styles */
  @apply dark:bg-gray-800 dark:text-gray-200 dark:border dark:border-gray-700;
}

.close-button {
  position: absolute;
  top: 10px;
  right: 15px;
  background: none;
  border: none;
  font-size: 1.8rem;
  cursor: pointer;
  color: #888;
  /* Dark mode styles */
  @apply dark:text-gray-400 dark:hover:text-white;
}
.close-button:hover {
  color: #333;
}

.loading-spinner, .error-message, .no-files {
  text-align: center;
  padding: 20px;
  font-size: 1.1rem;
  /* Dark mode styles */
  @apply dark:text-gray-300;
}
.error-message {
  color: #d9534f;
  /* Dark mode styles */
  @apply dark:text-red-400;
}

.folder-group {
  margin-bottom: 15px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  /* Dark mode styles */
  @apply dark:border-gray-700;
}
.folder-group:last-child {
  border-bottom: none;
}

.folder-header {
  cursor: pointer;
  font-size: 1.2rem;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  color: #007bff;
  /* Dark mode styles */
  @apply dark:text-blue-400 dark:hover:bg-gray-700;
}
.folder-header .icon {
  margin-right: 8px;
  font-size: 0.9em;
}

.file-list {
  list-style: none;
  padding-left: 25px;
}

.file-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
  /* Dark mode styles */
  @apply dark:border-gray-600;
}
.file-item:last-child {
  border-bottom: none;
}

.file-icon {
  margin-right: 10px;
  font-size: 1.2rem; 
}

.file-name {
  flex-grow: 1;
  font-weight: 500;
}

.file-info {
  font-size: 0.9rem;
  color: #777;
  margin-left: 10px;
  margin-right: 15px;
  white-space: nowrap;
  /* Dark mode styles */
  @apply dark:text-gray-400;
}

.download-button {
  padding: 5px 12px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
  /* Dark mode styles */
  @apply dark:bg-green-600 dark:hover:bg-green-700;
}
.download-button:hover {
  background-color: #218838;
}


</style>
