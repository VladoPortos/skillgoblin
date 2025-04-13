<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar">
    <div class="bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-white">User Management</h2>
        <button @click="close" class="text-gray-400 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <form @submit.prevent="updateUser" class="flex flex-col">
        <!-- Username field -->
        <div class="mb-4">
          <label for="name" class="block text-sm font-medium text-gray-300 mb-1">Username</label>
          <input
            v-model="userData.name"
            id="name"
            type="text"
            required
            class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
            placeholder="Enter your name"
          />
        </div>
        
        <!-- Avatar preview -->
        <ClientOnly>
          <div class="mb-4">
            <h3 class="block text-sm font-medium text-gray-300 mb-1">Avatar Preview</h3>
            <div class="flex justify-center">
              <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center">
                <Beanhead 
                  v-if="isValidAvatarJson(userData.avatar)"
                  v-bind="parseAvatar(userData.avatar)"
                  width="96"
                  aria-label="User avatar preview"
                />
                <div v-else class="text-white text-2xl">?</div>
              </div>
            </div>
          </div>
        </ClientOnly>
        
        <!-- Avatar customization -->
        <ClientOnly>
          <div class="avatar-customization-container overflow-y-auto max-h-[40vh] pr-2 mb-4 custom-scrollbar">
            <AvatarSelector
              v-model="userData.avatar"
              id="avatar"
              :hide-preview="true"
            />
          </div>
        </ClientOnly>
        
        <!-- Auth Section -->
        <div class="mb-4">
          <!-- Current auth status information -->
          <div class="mb-4 text-center">
            <div v-if="hasPassword" class="text-green-400 mb-2">
              <p>Your account is protected with a password</p>
            </div>
            <div v-else-if="hasPin" class="text-green-400 mb-2">
              <p>Your account is protected with a PIN</p>
            </div>
            <div v-else class="text-yellow-400 mb-2">
              <p>Your account is not protected</p>
            </div>
          </div>
          
          <!-- Auth options -->
          <div class="space-y-4">
            <div v-if="!hasPassword && !hasPin">
              <!-- Add protection if none exists -->
              <div class="mb-2">
                <label class="flex items-center">
                  <input type="checkbox" v-model="enableAuth" class="rounded text-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600" />
                  <span class="ml-2 text-sm text-gray-300">Add password or PIN protection</span>
                </label>
              </div>
              
              <!-- Auth type selection (only visible if enableAuth is true) -->
              <div v-if="enableAuth" class="auth-section">
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
                
                <!-- Password input -->
                <div v-if="authType === 'password'" class="mt-4">
                  <label for="password" class="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                  <input
                    v-model="userData.password"
                    id="password"
                    type="password"
                    class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                    placeholder="Enter a password"
                  />
                </div>
                
                <!-- PIN input -->
                <div v-if="authType === 'pin'" class="mt-4">
                  <h3 class="block text-sm font-medium text-gray-300 mb-2">New PIN (4 digits)</h3>
                  <div class="flex justify-center space-x-2 pin-input-container">
                    <input
                      v-for="(digit, index) in 4"
                      :key="index"
                      :id="`manage-pin-${index}`"
                      :ref="el => { if (el) managePinInputs[index] = el }"
                      v-model="managePinDigits[index]"
                      type="password"
                      inputmode="numeric"
                      maxlength="1"
                      pattern="[0-9]*"
                      class="w-12 h-12 text-center text-xl border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                      @input="handlePinInput($event, index)"
                      @keydown="handlePinKeydown($event, index)"
                      aria-label="PIN digit input"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div v-else>
              <!-- Change or remove existing auth -->
              <div class="space-y-4">
                <div class="flex justify-center mb-2">
                  <div class="auth-toggle-container inline-flex bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                    <button 
                      type="button"
                      @click="updateAuthAction = 'change'"
                      class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                      :class="{
                        'bg-blue-500 text-white': updateAuthAction === 'change',
                        'text-gray-700 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-600': updateAuthAction !== 'change'
                      }"
                    >
                      Change
                    </button>
                    <button 
                      type="button"
                      @click="updateAuthAction = 'switch'"
                      class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                      :class="{
                        'bg-blue-500 text-white': updateAuthAction === 'switch',
                        'text-gray-700 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-600': updateAuthAction !== 'switch'
                      }"
                    >
                      Switch Method
                    </button>
                    <button 
                      type="button"
                      @click="updateAuthAction = 'remove'"
                      class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                      :class="{
                        'bg-blue-500 text-white': updateAuthAction === 'remove',
                        'text-gray-700 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-600': updateAuthAction !== 'remove'
                      }"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                
                <!-- Change auth (password or PIN) -->
                <div v-if="updateAuthAction === 'change'">
                  <!-- Show password input only when user has password authentication -->
                  <div v-if="hasPassword" class="mt-4">
                    <label for="new-password" class="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                    <input
                      v-model="userData.password"
                      id="new-password"
                      type="password"
                      class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                      placeholder="Enter new password"
                    />
                  </div>
                  
                  <!-- Show PIN input only when user has PIN authentication -->
                  <div v-if="hasPin" class="mt-4">
                    <h3 class="block text-sm font-medium text-gray-300 mb-2">New PIN (4 digits)</h3>
                    <div class="flex justify-center space-x-2 pin-input-container">
                      <input
                        v-for="(digit, index) in 4"
                        :key="index"
                        :id="`manage-pin-${index}`"
                        :ref="el => { if (el) managePinInputs[index] = el }"
                        v-model="managePinDigits[index]"
                        type="text"
                        inputmode="numeric"
                        maxlength="1"
                        class="w-12 h-12 text-center text-xl border border-gray-600 rounded-md bg-gray-700 text-white"
                        @input="handlePinInput($event, index)"
                        @keydown="handlePinKeydown($event, index)"
                        aria-label="PIN digit input"
                      />
                    </div>
                  </div>
                </div>
                
                <!-- Switch auth method (from password to PIN or vice versa) -->
                <div v-if="updateAuthAction === 'switch'">
                  <div class="text-center mb-4 text-gray-300">
                    <p v-if="hasPassword">Switch from password to PIN protection</p>
                    <p v-else-if="hasPin">Switch from PIN to password protection</p>
                  </div>
                  
                  <!-- New PIN input if currently using password -->
                  <div v-if="hasPassword" class="mt-4">
                    <h3 class="block text-sm font-medium text-gray-300 mb-2">New PIN (4 digits)</h3>
                    <div class="flex justify-center space-x-2 pin-input-container">
                      <input
                        v-for="(digit, index) in 4"
                        :key="index"
                        :id="`switch-pin-${index}`"
                        :ref="el => { if (el) managePinInputs[index] = el }"
                        v-model="managePinDigits[index]"
                        type="text"
                        inputmode="numeric"
                        maxlength="1"
                        class="w-12 h-12 text-center border border-gray-600 rounded-md bg-gray-700 text-white text-xl"
                        @input="handlePinInput($event, index)"
                        @keydown="handlePinKeydown($event, index)"
                        aria-label="PIN digit input"
                      />
                    </div>
                  </div>
                  
                  <!-- New password input if currently using PIN -->
                  <div v-if="hasPin" class="mt-4">
                    <label for="new-switch-password" class="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                    <input
                      v-model="userData.password"
                      id="new-switch-password"
                      type="password"
                      class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                      placeholder="Enter new password"
                    />
                  </div>
                </div>
                
                <!-- Remove auth message -->
                <div v-if="updateAuthAction === 'remove'" class="text-yellow-400 text-center mt-4">
                  <p>Account protection will be removed. You will no longer need a password or PIN to log in.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Update/Save button -->
        <div class="mt-4 flex justify-end">
          <button
            type="submit"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Beanhead } from 'beanheads-vue';
import { useSession } from '~/composables/useSession';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'updated']);

// User data for the form
const userData = ref({
  id: '',
  name: '',
  avatar: '',
  password: null,
  pin: null,
  use_auth: 0,
  isAdmin: 0
});

// Authentication options
const enableAuth = ref(false);
const authType = ref('password');
const updateAuthAction = ref('change');

// PIN input handling
const managePinInputs = ref([]);
const managePinDigits = ref(['', '', '', '']);

// User composable for database operations
const { updateUserSettings } = useSession();

// Authentication state
const authState = ref({
  isLoading: true,
  hasPin: false,
  hasPassword: false
});

// Function to fetch complete user data with auth type information
const fetchUserAuthInfo = async () => {
  if (!props.user?.id) return;
  
  try {
    console.log('Fetching auth info for user:', props.user.id);
    authState.value.isLoading = true;
    
    const response = await fetch(`/api/users/${props.user.id}`);
    if (response.ok) {
      const userData = await response.json();
      console.log('Received user auth data:', userData);
      
      // Update auth state with data from API
      authState.value.hasPin = userData.has_pin === 1;
      authState.value.hasPassword = userData.has_password === 1;
      
      console.log('Auth state updated:', authState.value);
    }
  } catch (error) {
    console.error('Error fetching user auth info:', error);
  } finally {
    authState.value.isLoading = false;
  }
};

// Watch for show modal to fetch auth data
watch(() => props.show, (isVisible) => {
  if (isVisible && props.user?.id) {
    fetchUserAuthInfo();
  }
}, { immediate: true });

// Computed properties for authentication status
const hasPin = computed(() => {
  return props.user.use_auth === 1 && authState.value.hasPin;
});

const hasPassword = computed(() => {
  return props.user.use_auth === 1 && authState.value.hasPassword;
});

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

// Initialize form with user data
watch(() => props.user, (newUser) => {
  if (newUser) {
    console.log('User data received:', JSON.stringify(newUser, null, 2));
    
    userData.value = {
      id: newUser.id,
      name: newUser.name,
      avatar: newUser.avatar,
      password: null,
      pin: null,
      use_auth: newUser.use_auth,
      isAdmin: newUser.isAdmin
    };
    
    // Reset other form state
    enableAuth.value = false;
    updateAuthAction.value = 'change';
    managePinDigits.value = ['', '', '', ''];
    
    // Fetch auth info when user changes
    if (newUser.id) {
      fetchUserAuthInfo();
    }
  }
}, { immediate: true });

// Update authType when authentication status changes
watch([hasPin, hasPassword], ([newHasPin, newHasPassword]) => {
  authType.value = newHasPin ? 'pin' : 'password';
  console.log('Auth detection:', { hasPin: newHasPin, hasPassword: newHasPassword });
  console.log('Auth type being used:', authType.value);
});

// PIN input handling functions
const handlePinInput = (event, index) => {
  const value = event.target.value;
  
  // Only allow digits
  if (/^\d*$/.test(value)) {
    managePinDigits.value[index] = value;
    
    // Automatically move to next input
    if (value && index < 3 && managePinInputs.value[index + 1]) {
      managePinInputs.value[index + 1].focus();
    }
  } else {
    // Reset to empty if non-digit was entered
    managePinDigits.value[index] = '';
  }
};

const handlePinKeydown = (event, index) => {
  if (event.key === 'Backspace' && !managePinDigits.value[index] && index > 0 && managePinInputs.value[index - 1]) {
    managePinInputs.value[index - 1].focus();
  }
};

// Submit form handler
const updateUser = async () => {
  try {
    if (!userData.value.id && !props.user.id) {
      console.error('User ID is missing');
      return;
    }
    
    // Ensure we have a valid user ID
    const userId = userData.value.id || props.user.id;
    
    // Prepare the update payload - always include the ID and preserve admin status
    const updatePayload = {
      id: userId,
      name: userData.value.name,
      avatar: userData.value.avatar,
      isAdmin: props.user.isAdmin
    };
    
    // Handle authentication updates
    const shouldUpdateAuth = 
      enableAuth.value || 
      updateAuthAction.value !== 'change' || 
      (updateAuthAction.value === 'change' && hasPassword.value && userData.value.password) || 
      (updateAuthAction.value === 'change' && hasPin.value && managePinDigits.value.join('').length === 4);

    if (shouldUpdateAuth) {
      if (!hasPassword.value && !hasPin.value) {
        // Adding new protection
        if (enableAuth.value) {
          updatePayload.use_auth = 1;
          
          if (authType.value === 'password') {
            // Only set password, explicitly set PIN to null
            updatePayload.password = userData.value.password;
            updatePayload.pin = null;
          } else if (authType.value === 'pin') {
            const pinValue = managePinDigits.value.join('');
            if (pinValue.length === 4) {
              // Only set PIN, explicitly set password to null
              updatePayload.pin = pinValue;
              updatePayload.password = null;
            } else {
              console.error('PIN must be 4 digits');
              return; // Exit without completing
            }
          }
        } else {
          // No changes to auth - ensure both are null
          updatePayload.use_auth = 0;
          updatePayload.password = null;
          updatePayload.pin = null;
        }
      } else {
        // Updating existing protection
        if (updateAuthAction.value === 'change') {
          updatePayload.use_auth = 1;
          
          if (hasPassword.value) {
            if (userData.value.password) {
              // Update password, keep PIN as null
              updatePayload.password = userData.value.password;
              updatePayload.pin = null;
            } else {
              // No new password provided, don't update auth
              // Just continue to update other user fields
              delete updatePayload.use_auth;
            }
          } else if (hasPin.value) {
            const pinValue = managePinDigits.value.join('');
            if (pinValue.length === 4) {
              // Update PIN, keep password as null
              updatePayload.pin = pinValue;
              updatePayload.password = null;
            } else {
              // Invalid PIN, don't update auth
              // Just continue to update other user fields
              delete updatePayload.use_auth;
            }
          }
        } else if (updateAuthAction.value === 'switch') {
          // Switch from password to PIN or vice versa
          updatePayload.use_auth = 1;

          if (hasPassword.value) {
            // Switch from password to PIN
            const pinValue = managePinDigits.value.join('');
            if (pinValue.length === 4) {
              updatePayload.password = null;
              updatePayload.pin = pinValue;
            } else {
              console.error('PIN must be 4 digits');
              return; // Exit without completing
            }
          } else if (hasPin.value) {
            // Switch from PIN to password
            if (userData.value.password) {
              updatePayload.pin = null;
              updatePayload.password = userData.value.password;
            } else {
              console.error('Password cannot be empty');
              return; // Exit without completing
            }
          }
        } else if (updateAuthAction.value === 'remove') {
          // Remove protection completely
          updatePayload.use_auth = 0;
          updatePayload.password = null;
          updatePayload.pin = null;
        }
      }
    } else {
      // User is only updating profile info (name, avatar), not auth
      // Don't include auth fields in the update payload
      delete updatePayload.use_auth;
      delete updatePayload.password;
      delete updatePayload.pin;
    }
    
    console.log('Updating user with payload:', updatePayload);
    
    // Call the API to update the user
    const result = await updateUserSettings(updatePayload);
    
    if (result.success) {
      emit('updated', result.user);
      emit('close');
    } else {
      console.error('Failed to update user:', result.message);
    }
  } catch (error) {
    console.error('Error updating user:', error);
  }
};

// Close the modal
const close = () => {
  emit('close');
};

// Auto-focus on first pin input when component is mounted and visible
watch(() => props.show, (newVal) => {
  if (newVal && authType.value === 'pin') {
    // Wait for the DOM to update
    setTimeout(() => {
      if (managePinInputs.value[0]) {
        managePinInputs.value[0].focus();
      }
    }, 100);
  }
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: #2d3748;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #4a5568;
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #718096;
}
</style>
