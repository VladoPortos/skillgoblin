<template>
  <div class="user-profile flex items-center space-x-2 cursor-pointer" @click="toggleMenu">
    <!-- Super obvious gold ring around admin avatar -->
    <div class="inline-block">
      <!-- Direct styling with class binding for admin avatar -->
      <div 
        class="avatar-container h-10 w-10 rounded-full overflow-hidden flex items-center justify-center bg-gray-700"
        :class="{ 'admin-avatar': isUserAdmin }"
      >
        <Beanhead v-if="user && user.avatar && isValidAvatarJson(user.avatar)" v-bind="parseAvatar(user.avatar)" width="40" />
        <span v-else class="text-white text-lg">{{ user && user.name ? user.name.charAt(0).toUpperCase() : '?' }}</span>
      </div>
    </div>
    
    <!-- User name and dropdown toggle -->
    <div class="relative">
      <div class="flex items-center space-x-1 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
        <span class="hidden sm:inline truncate max-w-[100px]" :title="user ? user.name : ''">
          {{ user && user.name ? (user.name.length > 10 ? user.name.substring(0, 10) + '...' : user.name) : 'User' }}
          <small v-if="isUserAdmin" class="text-yellow-400">(admin)</small>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      
      <!-- User dropdown menu -->
      <div v-if="showUserMenu" ref="dropdownMenu" class="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg py-1 z-10">
        <!-- Admin-only options -->
        <template v-if="isUserAdmin">
          <button 
            @click="rescanDatabase" 
            class="block w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-600"
          >
            <span class="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Rescan Database
            </span>
          </button>
          <div class="border-t border-gray-200 dark:border-gray-600 my-1"></div>
        </template>
        
        <!-- User management option -->
        <button 
          @click="manageUser" 
          class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          <span class="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            User Management
          </span>
        </button>
        
        <button 
          @click="logout" 
          class="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          Logout
        </button>
        <button 
          @click="confirmDelete" 
          class="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-600"
        >
          Delete Account
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Beanhead } from 'beanheads-vue';

const props = defineProps({
  user: {
    type: Object,
    required: true
  }
});

// Create a computed property for more robust admin check
const isUserAdmin = computed(() => {
  if (!props.user) return false;
  
  // Check if user has admin flag set
  const hasAdminFlag = props.user.isAdmin === 1 || props.user.isAdmin === '1' || props.user.isAdmin === true;
  
  return hasAdminFlag;
});

const emit = defineEmits(['logout', 'delete', 'rescan', 'manage']);

const showUserMenu = ref(false);
const dropdownMenu = ref(null);

// Helper functions for avatar handling
const isValidAvatarJson = (avatarString) => {
  if (!avatarString) return false;
  try {
    JSON.parse(avatarString);
    return true;
  } catch (e) {
    return false;
  }
};

const parseAvatar = (avatarString) => {
  try {
    return JSON.parse(avatarString);
  } catch (e) {
    return {};
  }
};

function toggleMenu() {
  showUserMenu.value = !showUserMenu.value;
}

function logout() {
  showUserMenu.value = false;
  emit('logout');
}

function confirmDelete() {
  showUserMenu.value = false;
  emit('delete');
}

function rescanDatabase() {
  showUserMenu.value = false;
  emit('rescan');
}

function manageUser() {
  showUserMenu.value = false;
  emit('manage');
}

// Close menu when clicking outside
const clickOutside = (event) => {
  if (showUserMenu.value && dropdownMenu.value && !dropdownMenu.value.contains(event.target) && !event.target.closest('.user-profile')) {
    showUserMenu.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', clickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', clickOutside);
});

// Debug logs
// console.log('UserProfile - user object:', props.user);
// console.log('Is root user?', props.user?.name === 'root' || props.user?.name === 'Root');
// console.log('Admin flag value:', props.user?.isAdmin);
// console.log('Is admin (computed)?', isUserAdmin.value);
</script>

<style scoped>
.user-profile {
  position: relative;
}

.avatar-container {
  transition: transform 0.2s;
}

.avatar-container:hover {
  transform: scale(1.05);
}

.admin-avatar {
  border: 3px solid #F59E0B;
  box-shadow: 0 0 10px #F59E0B;
}
</style>
