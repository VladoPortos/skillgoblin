<template>
  <div class="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
    <div class="max-w-md w-full flex flex-col items-center">
      <div class="text-center mb-3">
        <!-- Banner with placeholder and fade-in effect -->
        <div class="relative max-h-[28vh] min-h-[180px] w-full flex justify-center mb-2">
          <!-- Placeholder that shows immediately -->
          <img
            src="/logos/skillgoblin-logo-wide.png"
            :alt="branding.name"
            class="max-h-[28vh] min-h-[180px] w-auto absolute transition-opacity duration-300"
            :class="bannerLoaded ? 'opacity-0' : 'opacity-100'"
          />
          <!-- Actual random banner that fades in when loaded -->
          <img
            :src="randomBanner"
            :alt="branding.name"
            class="max-h-[28vh] min-h-[180px] w-auto transition-opacity duration-300"
            :class="bannerLoaded ? 'opacity-100' : 'opacity-0'"
            @load="bannerLoaded = true"
          />
        </div>
        <h1 class="text-3xl font-bold text-white">{{ branding.name }}</h1>
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
          <!-- Every account has credentials, so the lock icon is universal. -->
          <span class="mt-1 text-xs text-gray-500">🔒</span>
        </div>
        
        <!-- New User Button — hidden when self-registration is disabled. -->
        <div
          v-if="systemSettings.allow_user_registration"
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
    <div
      v-if="showCreateUser"
      class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar"
      @click.self="onCreateUserBackdropClick"
    >
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
              class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
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
          
          <!-- Phase 3: auth is mandatory; the old "protect" checkbox is gone.
               PIN tab is hidden when the admin globally disabled PINs. -->
          <div v-if="!hasAdmin" class="mb-4">
            <label class="flex items-center">
              <input type="checkbox" v-model="isAdminCheckbox" class="rounded text-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600" />
              <span class="ml-2 text-sm text-gray-300">Is Admin</span>
            </label>
          </div>

          <div class="mb-4">
            <p class="text-xs text-gray-400 mb-3">
              Set a password, a PIN, or both. Both is recommended — quick-tap
              PIN for daily use plus a password fallback if PINs are ever
              disabled.
            </p>
            <!-- Auth Type Toggle -->
            <div v-if="systemSettings.allow_pin" class="flex justify-center mb-4">
              <div class="auth-toggle-container inline-flex bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                <button
                  type="button"
                  data-testid="signup-mode-password"
                  @click="authType = 'password'"
                  class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  :class="authType === 'password' ? 'bg-blue-500 text-white' : 'text-gray-300'"
                >Password</button>
                <button
                  type="button"
                  data-testid="signup-mode-pin"
                  @click="authType = 'pin'"
                  class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  :class="authType === 'pin' ? 'bg-blue-500 text-white' : 'text-gray-300'"
                >PIN</button>
                <button
                  type="button"
                  data-testid="signup-mode-both"
                  @click="authType = 'both'"
                  class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                  :class="authType === 'both' ? 'bg-blue-500 text-white' : 'text-gray-300'"
                >Both</button>
              </div>
            </div>

            <!-- Password Input -->
            <div v-if="authType === 'password' || authType === 'both' || !systemSettings.allow_pin" class="mb-4">
              <label for="password-input" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                ref="passwordInput"
                id="password-input"
                data-testid="signup-password-input"
                v-model="newUser.password"
                type="password"
                class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
                placeholder="Enter a password"
              />
            </div>

            <!-- PIN Input — only when PINs are globally enabled -->
            <div v-if="(authType === 'pin' || authType === 'both') && systemSettings.allow_pin">
              <h3 class="block text-sm font-medium text-gray-300 mb-2">PIN (4 digits)</h3>
              <PinInput
                v-model="createPinDigits"
                id-prefix="create-pin"
                test-id-prefix="signup-pin"
              />
            </div>
          </div>
          
          <div v-if="createError" class="mb-4 text-red-500 text-sm">
            {{ createError }}
          </div>
          
          <div class="mt-6 flex justify-center space-x-3">
            <button
              type="button"
              @click="showCreateUser = false"
              :disabled="isCreating"
              class="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 rounded-md disabled:opacity-50"
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
    <div
      v-if="showAuthModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar"
      @click.self="onAuthBackdropClick"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">Authentication Required</h2>

        <form @submit.prevent="onAuthSubmit">
          <div class="mb-4">
            <div class="space-y-3">
              <!-- Toggle only when the user has BOTH credentials. Defaults to
                   PIN (set in the watcher below) for the quick-tap path. -->
              <div
                v-if="selectedUser.password && selectedUser.pin"
                class="flex justify-center mb-2"
                data-testid="login-mode-toggle"
              >
                <div class="auth-toggle-container inline-flex bg-gray-200 dark:bg-gray-700 rounded-full p-1">
                  <button
                    type="button"
                    data-testid="login-mode-pin"
                    :aria-pressed="String(loginMode === 'pin')"
                    @click="loginMode = 'pin'"
                    class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                    :class="loginMode === 'pin' ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-300'"
                  >PIN</button>
                  <button
                    type="button"
                    data-testid="login-mode-password"
                    :aria-pressed="String(loginMode === 'password')"
                    @click="loginMode = 'password'"
                    class="px-3 py-1 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-colors duration-200"
                    :class="loginMode === 'password' ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-300'"
                  >Password</button>
                </div>
              </div>

              <!-- Password input -->
              <div v-if="loginMode === 'password'">
                <label for="auth-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  v-model="authData.password"
                  id="auth-password"
                  ref="passwordInput"
                  type="password"
                  class="w-full px-3 py-2 border dark:border-gray-600 rounded-md shadow-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter your password"
                />
              </div>

              <!-- PIN input -->
              <div v-if="loginMode === 'pin'" class="mt-4">
                <h3 class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PIN</h3>
                <PinInput
                  ref="pinInputRef"
                  v-model="pinDigits"
                  id-prefix="pin"
                />
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

    <!-- Phase 3: legacy bootstrap + post-login credential-update flow -->
    <SetCredentialsModal
      v-if="selectedUser"
      :show="showSetCredentialsModal"
      :mode="setCredentialsMode || 'bootstrap'"
      :user="selectedUser"
      :allow-pin="systemSettings.allow_pin"
      @success="finishCredentialUpdate"
      @dismiss="dismissSetCredentials"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from '~/composables/useSession';
import { useUserManagement } from '~/composables/useUserManagement';
import AvatarSelector from '../components/AvatarSelector.vue';
import SetCredentialsModal from '../components/SetCredentialsModal.vue';
import PinInput from '../components/ui/PinInput.vue';
import { Beanhead } from 'beanheads-vue';

const branding = useRuntimeConfig().public.branding;

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
  showSetCredentialsModal,
  setCredentialsMode,
  systemSettings,
  fetchUsers,
  selectUser,
  authenticateUser,
  createUser,
  finishCredentialUpdate
} = useUserManagement();

// Template ref to the login PIN component so we can programmatically focus
// the first digit when the auth modal opens for a PIN-capable user.
const pinInputRef = ref(null);
const passwordInput = ref(null);

// Dismiss handler for SetCredentialsModal. Bootstrap dismissals just close
// the modal (the user has no session yet). Post-login dismissals close the
// modal AND route to /courses — the PIN bridge already issued a session,
// so they're authenticated; they just deferred the password setup.
function dismissSetCredentials() {
  const wasPostLogin = setCredentialsMode.value === 'post-login';
  showSetCredentialsModal.value = false;
  setCredentialsMode.value = null;
  if (wasPostLogin) {
    router.push('/courses');
  }
}

// Reset the create-user PIN field whenever the auth-type tab switches to PIN
// (so a stale value from a previous tab visit doesn't survive into the new
// session). Login PIN gets its own reset in the showAuthModal watcher below.
watch(() => authType.value, (newAuthType) => {
  if (newAuthType === 'pin') {
    createPinDigits.value = '';
  }
});
const isAdminCheckbox = ref(false);

// Login modal state — which credential the user picked when they have both.
// Defaults to PIN (faster, what most family-mode users will tap), but the
// modal exposes a toggle when both credentials exist on the account.
const loginMode = ref('pin');
watch(() => showAuthModal.value, (isOpen) => {
  if (!isOpen) return;
  // Reset on each open. PIN-default if the user has one; otherwise password.
  loginMode.value = selectedUser.value?.pin ? 'pin' : 'password';
  authData.value = { password: '', pin: '' };
  pinDigits.value = '';
  authError.value = '';
});
// Clear the inactive input when the user toggles modes so a stale value
// doesn't get sent and trip the rate limiter on a wrong-credential miss.
watch(loginMode, (mode) => {
  if (mode === 'pin') {
    authData.value.password = '';
  } else {
    pinDigits.value = '';
  }
  authError.value = '';
});

function onAuthSubmit() {
  return authenticateUser(loginMode.value);
}

// Backdrop click on the auth modal acts like Cancel — but blocked while
// an auth request is in flight so an accidental outside-click can't hide
// a pending failure.
function onAuthBackdropClick() {
  if (isAuthenticating.value) return;
  showAuthModal.value = false;
}

// Same in-flight guard for the Create User modal: the create POST writes
// createError back into the modal on failure, which would land in a
// closed modal if the user clicked the backdrop while it was running.
function onCreateUserBackdropClick() {
  if (isCreating.value) return;
  showCreateUser.value = false;
}

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
  createPinDigits.value = '';
  isAdminCheckbox.value = false;
  useAuth.value = true; // auth is mandatory now (the legacy "no-auth" path is gone)
  // Default to password; force it when PINs are disabled globally so the
  // PIN tab can never be selected when it cannot be used.
  authType.value = systemSettings.value.allow_pin ? 'password' : 'password';
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
  
  // Operator override probe: if /api/login-banner returns 200 the operator
  // dropped a custom banner — use it directly, no rotation. Otherwise
  // fall back to the existing random rotation from /api/random-banner so
  // existing installs keep their current behavior exactly.
  //
  // Wraps the HEAD in an AbortController with a 3s timeout so a stalled
  // network doesn't leave the user staring at the placeholder forever;
  // the timeout falls through to the rotation just like a 404 would.
  const probeController = new AbortController();
  const probeTimeout = setTimeout(() => probeController.abort(), 3000);
  fetch('/api/login-banner', { method: 'HEAD', signal: probeController.signal })
    .then((probe) => {
      clearTimeout(probeTimeout);
      if (probe.ok) {
        randomBanner.value = '/api/login-banner';
        return;
      }
      return $fetch('/api/random-banner').then(({ path }) => {
        if (path) {
          const img = new Image();
          img.onload = () => randomBanner.value = path;
          img.src = path;
        }
      });
    })
    .catch(() => {
      // Probe aborted/errored — fall back to the rotation.
      clearTimeout(probeTimeout);
      $fetch('/api/random-banner').then(({ path }) => {
        if (path) {
          const img = new Image();
          img.onload = () => randomBanner.value = path;
          img.src = path;
        }
      }).catch(console.error);
    });
});

// Auto-focus the right input when the auth modal opens. PIN-capable users
// land on the first digit; password-only users land on the password field.
watch(showAuthModal, (newValue) => {
  if (newValue) {
    nextTick(() => {
      if (selectedUser.value?.pin) {
        pinInputRef.value?.focus();
      } else if (passwordInput.value) {
        passwordInput.value.focus();
      }
    });
  }
});

// Fix user creation handler to properly pass data
const handleCreateUser = async () => {
  try {
    // Prepare user data — 'both' includes both fields; 'password' / 'pin'
    // include only one. Server enforces at-least-one and 4-digit PIN format.
    const wantsPassword = authType.value === 'password' || authType.value === 'both';
    const wantsPin = (authType.value === 'pin' || authType.value === 'both') && systemSettings.value.allow_pin;
    const passwordValue = newUser.value.password || '';
    const pinValue = createPinDigits.value;

    // Mode-specific client-side validation. Without this, "Both" + only one
    // input filled would silently fall back to that single credential at the
    // composable level (it coerces empty strings to null).
    if (wantsPassword && !passwordValue) {
      createError.value = 'Please enter a password.';
      return;
    }
    if (wantsPin && !/^\d{4}$/.test(pinValue)) {
      createError.value = 'PIN must be exactly 4 digits.';
      return;
    }

    const userData = {
      name: newUser.value.name,
      avatar: newUser.value.avatar,
      password: wantsPassword ? passwordValue : null,
      pin: wantsPin ? pinValue : null,
      isAdmin: isAdminCheckbox.value
    };
    
    await createUser(userData);
    
    // Reset form
    showCreateUser.value = false;
    newUser.value = { name: '', avatar: '', password: '', pin: '' };
    createPinDigits.value = '';
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
