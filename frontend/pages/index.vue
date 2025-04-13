<template>
  <div class="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
    <div class="max-w-md w-full flex flex-col items-center">
      <div class="text-center mb-3">
        <!-- Banner with placeholder and fade-in effect -->
        <div class="relative max-h-[28vh] min-h-[180px] w-full flex justify-center mb-2">
          <!-- Placeholder that shows immediately -->
          <img 
            src="/logos/skillgoblin-logo-wide.png" 
            alt="SkillGoblin" 
            class="max-h-[28vh] min-h-[180px] w-auto absolute transition-opacity duration-300"
            :class="bannerLoaded ? 'opacity-0' : 'opacity-100'"
          />
          <!-- Actual random banner that fades in when loaded -->
          <img 
            :src="randomBanner" 
            alt="SkillGoblin" 
            class="max-h-[28vh] min-h-[180px] w-auto transition-opacity duration-300"
            :class="bannerLoaded ? 'opacity-100' : 'opacity-0'"
            @load="bannerLoaded = true"
          />
        </div>
        <h1 class="text-3xl font-bold text-white">SkillGoblin</h1>
        <p class="mt-1 text-gray-400 text-sm">Select a user to continue</p>
      </div>
      
      <!-- Loading state -->
      <div v-if="isLoading" class="w-full py-6">
        <div class="flex justify-center mb-4">
          <div class="animate-pulse flex space-x-4">
            <div class="rounded-full bg-gray-700 h-16 w-16"></div>
            <div class="rounded-full bg-gray-700 h-16 w-16"></div>
            <div class="rounded-full bg-gray-700 h-16 w-16"></div>
          </div>
        </div>
        <div class="text-center text-gray-400 text-sm">
          <p>Loading users...</p>
        </div>
      </div>
      
      <!-- Debug info -->
      <div v-if="!isLoading && users.length > 0" class="text-white text-xs mb-1 col-span-3 text-center">
        <p>Found {{ users.length }} users</p>
      </div>
      
      <!-- Users grid -->
      <div v-if="!isLoading" :class="{ 'grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 mt-2': users.length > 0, 'flex justify-center mt-2': users.length === 0 }">
        <!-- Existing Users -->
        <div 
          v-for="user in users" 
          :key="user.id"
          class="bg-gray-800 rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-gray-700"
          @click="selectUser(user)"
        >
          <ClientOnly>
            <div 
              class="w-16 h-16 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center mb-2"
              :class="{ 'border-2 border-yellow-400': user.isAdmin === 1 }"
            >
              <template v-if="user.avatar && isValidAvatarJson(user.avatar)">
                <Beanhead 
                  v-bind="parseAvatar(user.avatar)"
                  width="64"
                />
              </template>
              <template v-else>
                <div class="w-full h-full bg-blue-600 flex items-center justify-center text-white text-2xl">
                  {{ user.name ? user.name.charAt(0).toUpperCase() : 'U' }}
                </div>
              </template>
            </div>
          </ClientOnly>
          <span class="text-white text-center truncate max-w-full" :title="user.name">
            {{ user.name.length > 12 ? user.name.substring(0, 12) + '...' : user.name }}
          </span>
          <span v-if="user.use_auth" class="mt-1 text-xs text-gray-500">🔒</span>
        </div>
        
        <!-- New User Button -->
        <div 
          class="bg-gray-800 rounded-lg p-4 flex flex-col items-center cursor-pointer hover:bg-gray-700"
          @click="openCreateUserModal"
        >
          <div class="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-3xl mb-2">
            +
          </div>
          <span class="text-white text-center">New User</span>
        </div>
      </div>
    </div>
    
    <!-- Create User Modal -->
    <div v-if="showCreateUser" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar">
      <div class="bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 class="text-xl font-bold text-white mb-4">Create New User</h2>
        
        <form @submit.prevent="handleCreateUser" class="flex flex-col">
          <!-- Fixed section (always visible) -->
          <div class="mb-4">
            <label for="name" class="block text-sm font-medium text-gray-300 mb-1">Name</label>
            <input
              v-model="newUser.name"
              id="name"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
              placeholder="Enter your name"
            />
          </div>
          
          <ClientOnly>
            <div class="mb-4">
              <h3 class="block text-sm font-medium text-gray-300 mb-1">Avatar Preview</h3>
              <div class="flex justify-center">
                <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                  <Beanhead 
                    v-if="isValidAvatarJson(newUser.avatar)"
                    v-bind="parseAvatar(newUser.avatar)"
                    width="96"
                    aria-label="User avatar preview"
                  />
                  <div v-else class="text-white text-2xl">?</div>
                </div>
              </div>
            </div>
          </ClientOnly>
          
          <!-- Scrollable section (avatar customization) -->
          <ClientOnly>
            <div class="avatar-customization-container overflow-y-auto max-h-[40vh] pr-2 mb-4 custom-scrollbar">
              <AvatarSelector
                v-model="newUser.avatar"
                id="avatar"
                :hide-preview="true"
              />
            </div>
          </ClientOnly>
          
          <div class="mb-4">
            <label class="flex items-center">
              <input type="checkbox" v-model="useAuth" class="rounded text-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600" />
              <span class="ml-2 text-sm text-gray-300">Protect account with password or PIN</span>
            </label>
          </div>
          
          <div v-if="!hasAdmin" class="mb-4">
            <label class="flex items-center">
              <input type="checkbox" v-model="isAdminCheckbox" class="rounded text-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600" />
              <span class="ml-2 text-sm text-gray-300">Is Admin</span>
            </label>
          </div>
          
          <div v-if="useAuth" class="mb-4">
            <!-- Auth Type Toggle -->
            <div class="flex justify-center mb-4">
              <div class="auth-toggle-container inline-flex bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                <button 
                  type="button"
                  @click="authType = 'password'"
                  class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  :class="authType === 'password' ? 'bg-blue-500 text-white' : 'text-gray-300'"
                >
                  Password
                </button>
                <button 
                  type="button"
                  @click="authType = 'pin'"
                  class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  :class="authType === 'pin' ? 'bg-blue-500 text-white' : 'text-gray-300'"
                >
                  PIN
                </button>
              </div>
            </div>
            
            <!-- Password Input -->
            <div v-if="authType === 'password'">
              <label for="password-input" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                ref="passwordInput"
                id="password-input"
                v-model="newUser.password"
                type="password"
                class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                placeholder="Enter a password"
              />
            </div>
            
            <!-- PIN Input -->
            <div v-if="authType === 'pin'">
              <h3 class="block text-sm font-medium text-gray-300 mb-2">PIN (4 digits)</h3>
              <div class="flex justify-center space-x-2 pin-input-container">
                <input
                  v-for="(digit, index) in 4"
                  :key="index"
                  :ref="el => { if (el && createPinInputs.value) createPinInputs.value[index] = el }"
                  v-model="createPinDigits[index]"
                  type="password"
                  inputmode="numeric"
                  maxlength="1"
                  pattern="[0-9]*"
                  class="w-12 h-12 text-center text-2xl bg-gray-700 border border-gray-600 rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500 text-white"
                  @input="handleCreatePinInput($event, index)"
                  @keydown="handleCreatePinKeydown($event, index)"
                  aria-label="PIN digit input"
                />
              </div>
            </div>
          </div>
          
          <div v-if="createError" class="mb-4 text-red-500 text-sm">
            {{ createError }}
          </div>
          
          <div class="mt-6 flex justify-center space-x-3">
            <button
              type="button"
              @click="showCreateUser = false"
              class="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="isCreating"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {{ isCreating ? 'Creating...' : 'Create User' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Auth Modal -->
    <div v-if="showAuthModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Authentication Required</h2>
        
        <form @submit.prevent="authenticateUser">
          <div class="mb-4">
            <div class="space-y-3">
              <!-- Password input - only shown if user has password -->
              <div v-if="!selectedUser.pin">
                <label for="auth-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  v-model="authData.password"
                  id="auth-password"
                  ref="passwordInput"
                  type="password"
                  class="w-full px-3 py-2 border dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter your password"
                />
              </div>
              
              <!-- PIN input - only shown if user has PIN -->
              <div v-if="selectedUser.pin" class="mt-4">
                <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PIN</h3>
                <div class="flex justify-center space-x-2 pin-input-container">
                  <input
                    v-for="(digit, index) in 4"
                    :key="index"
                    :id="`pin-${index}`"
                    :ref="el => { if (el && pinInputs.value) pinInputs.value[index] = el }"
                    v-model="pinDigits[index]"
                    type="password"
                    inputmode="numeric"
                    maxlength="1"
                    class="w-12 h-12 text-center text-2xl bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                    @input="handlePinInput($event, index)"
                    @keydown="handlePinKeydown($event, index)"
                    aria-label="PIN digit input"
                  />
                </div>
              </div>
              
              <p v-if="authError" class="text-sm text-red-600 dark:text-red-400">
                {{ authError }}
              </p>
            </div>
          </div>
          
          <!-- Center the buttons with more space above -->
          <div class="flex justify-center space-x-3 mt-8">
            <button
              type="button"
              @click="showAuthModal = false"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="isAuthenticating"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
            >
              {{ isAuthenticating ? 'Authenticating...' : 'Login' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '~/composables/useSession';
import { useUserManagement } from '~/composables/useUserManagement';
import AvatarSelector from '../components/AvatarSelector.vue';
import { Beanhead } from 'beanheads-vue';

const router = useRouter();
const { login } = useSession();
const {
  users,
  isLoading,
  hasAdmin,
  showCreateUser,
  newUser,
  isCreating,
  createError,
  useAuth,
  authType,
  showAuthModal,
  isAuthenticating,
  authError,
  selectedUser,
  pinDigits,
  authData,
  createPinDigits,
  fetchUsers,
  selectUser,
  authenticateUser,
  createUser
} = useUserManagement();

// Local template refs - initialize arrays for PIN inputs
const pinInputs = ref(Array(4).fill(null));
const createPinInputs = ref(Array(4).fill(null));
const passwordInput = ref(null);

// Make sure refs are initialized when switching auth type
watch(() => authType.value, (newAuthType) => {
  if (newAuthType === 'pin') {
    // Reset PIN arrays when switching to PIN mode
    createPinInputs.value = Array(4).fill(null);
    createPinDigits.value = ['', '', '', ''];
  }
});
const isAdminCheckbox = ref(false);

// Other reactive data
const randomBanner = ref('/logos/skillgoblin-logo-wide.png');
const bannerLoaded = ref(false);

// Helper functions for avatar handling
const isValidAvatarJson = (avatarString) => {
  try {
    const parsed = JSON.parse(avatarString);
    return typeof parsed === 'object' && parsed !== null && 
           (parsed.skin !== undefined || parsed.hair !== undefined || parsed.eye !== undefined);
  } catch (e) {
    return false;
  }
};

const parseAvatar = (avatarString) => {
  try {
    return JSON.parse(avatarString);
  } catch (e) {
    console.error('Failed to parse avatar data:', e);
    return {};
  }
};

// Show the create user modal
const openCreateUserModal = () => {
  createPinDigits.value = ['', '', '', ''];
  isAdminCheckbox.value = false;
  useAuth.value = false;
  authType.value = 'password';
  authError.value = '';
  createError.value = '';
  
  newUser.value = {
    name: '',
    avatar: JSON.stringify({
      skin: 'light',
      body: 'chest',
      eye: 'normal-eyes',
      withLashes: false,
      eyebrows: 'normal',
      mouth: 'grin',
      lipColor: 'red',
      facialHair: 'none',
      hair: 'none',
      hairColor: 'brown',
      clothing: 'none',
      clothingColor: 'white',
      clothingGraphic: 'none',
      hat: 'none',
      hatColor: 'white',
      accessory: 'none',
      faceMask: false,
      faceMaskColor: 'white'
    }),
    password: '',
    pin: ''
  };
  
  showCreateUser.value = true;
  
  setTimeout(() => {
    const randomizeButton = document.querySelector('.avatar-options button');
    if (randomizeButton) randomizeButton.click();
  }, 100);
};

// Make sure we fetch users on page load
onMounted(async () => {
  fetchUsers();
  
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchUsers();
    });
  }
  
  $fetch('/api/random-banner')
    .then(({ path }) => {
      if (path) {
        const img = new Image();
        img.onload = () => randomBanner.value = path;
        img.src = path;
      }
    })
    .catch(console.error);
});

// PIN input handlers
const handlePinInput = (event, index) => {
  const value = event.target.value;
  if (/^\d*$/.test(value)) {
    pinDigits.value[index] = value;
    // Immediate focus for next field
    if (value && index < 3) {
      const nextInput = event.target.nextElementSibling;
      if (nextInput && nextInput.tagName === 'INPUT') {
        nextInput.focus();
      }
    }
  } else {
    pinDigits.value[index] = '';
  }
};

const handlePinKeydown = (event, index) => {
  if (event.key === 'Backspace' && !pinDigits.value[index] && index > 0 && pinInputs.value?.[index - 1]) {
    pinInputs.value[index - 1].focus();
  }
};

const handleCreatePinInput = (event, index) => {
  const value = event.target.value;
  if (/^\d*$/.test(value)) {
    createPinDigits.value[index] = value;
    // Immediate focus for next field - use same approach as login PIN input
    if (value && index < 3) {
      const nextInput = event.target.nextElementSibling;
      if (nextInput && nextInput.tagName === 'INPUT') {
        nextInput.focus();
      }
    }
  } else {
    createPinDigits.value[index] = '';
  }
};

const handleCreatePinKeydown = (event, index) => {
  if (event.key === 'Backspace' && !createPinDigits.value[index] && index > 0 && createPinInputs.value?.[index - 1]) {
    createPinInputs.value[index - 1].focus();
  }
};

// Auto-focus on input fields when auth modal appears
watch(showAuthModal, (newValue) => {
  if (newValue) {
    nextTick(() => {
      if (selectedUser.value?.pin) {
        const firstPinInput = document.querySelector('#pin-0');
        if (firstPinInput) firstPinInput.focus();
      } else if (passwordInput.value) {
        passwordInput.value.focus();
      }
    });
  }
});

// Fix user creation handler to properly pass data
const handleCreateUser = async () => {
  try {
    // Prepare user data
    const userData = {
      name: newUser.value.name,
      avatar: newUser.value.avatar,
      password: authType.value === 'password' ? newUser.value.password : null,
      pin: authType.value === 'pin' ? createPinDigits.value.join('') : null,
      isAdmin: isAdminCheckbox.value
    };
    
    await createUser(userData);
    
    // Reset form
    showCreateUser.value = false;
    newUser.value = { name: '', avatar: '', password: '', pin: '' };
    createPinDigits.value = ['', '', '', ''];
    isAdminCheckbox.value = false;
    
  } catch (error) {
    console.error('Error creating user:', error);
  }
};
</script>

<style scoped>
.avatar-customization-container {
  border: 1px solid #ccc;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: #666 rgba(31, 41, 55, 0.2);
}
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #666;
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background-color: rgba(31, 41, 55, 0.1);
  border-radius: 10px;
}

/* Dark mode scrollbar */
.dark .custom-scrollbar {
  scrollbar-color: #888 rgba(255, 255, 255, 0.1);
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #888;
}
.dark .custom-scrollbar::-webkit-scrollbar-track {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
