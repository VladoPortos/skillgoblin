<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar"
    @click.self="tryClose"
  >
    <div class="bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-white">My Profile</h2>
        <button @click="tryClose" :disabled="savingPassword || savingPin" class="text-gray-400 hover:text-white disabled:opacity-50">
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
            class="w-full px-3 py-2 border border-gray-600 rounded-md shadow-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
            placeholder="Enter your name"
          />
        </div>
        
        <!-- Avatar preview — sticky so it stays visible while the user
             scrolls through the AvatarSelector options below, giving a
             true live preview of every change. -->
        <ClientOnly>
          <div class="sticky top-0 z-10 bg-gray-800 pt-2 pb-4 -mt-2 mb-4">
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
        
        <!-- Profile (name + avatar) save -->
        <div class="mb-4 flex justify-end">
          <button
            type="submit"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            Save Changes
          </button>
        </div>
      </form>

      <!-- Credentials — independent panels, OUTSIDE the profile form so
           Enter in a credential field doesn't submit the profile (which
           would close the modal without saving the typed credential).
           Server enforces the credential floor (no account can end up with
           neither password nor PIN). PIN panel hides when the admin
           disabled PINs (existing PIN holders can re-enable later). -->
      <div class="space-y-4">
        <!-- Password panel -->
        <div class="border-t border-gray-700 pt-4">
          <h3 class="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            Password
            <span v-if="hasPassword" class="text-xs text-green-400">✓ set</span>
            <span v-else class="text-xs text-gray-500">not set</span>
          </h3>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              v-model="newPasswordValue"
              type="password"
              data-testid="profile-password-input"
              class="flex-1 px-3 py-2 border border-gray-600 rounded-md shadow-xs focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-700 text-white"
              :placeholder="hasPassword ? 'New password' : 'Set a password'"
              @keyup.enter="savePassword"
            />
            <button
              type="button"
              data-testid="profile-password-action"
              @click="savePassword"
              :disabled="!newPasswordValue || savingPassword"
              class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {{ hasPassword ? 'Change password' : 'Add password' }}
            </button>
          </div>
          <p
            v-if="passwordFeedback"
            data-testid="profile-password-feedback"
            :class="passwordFeedbackError ? 'text-red-400' : 'text-green-400'"
            class="text-xs mt-1"
          >{{ passwordFeedback }}</p>
        </div>

        <!-- PIN panel — hidden entirely when admin disabled PINs globally
             (matches the feature contract; existing PIN auth is rejected
             at /api/users/auth, the stale PIN row stays untouched). -->
        <div v-if="allowPin" class="border-t border-gray-700 pt-4">
          <h3 class="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2 justify-center">
            PIN (4 digits)
            <span v-if="hasPin" class="text-xs text-green-400">✓ set</span>
            <span v-else class="text-xs text-gray-500">not set</span>
          </h3>
          <div class="mb-3">
            <PinInput
              v-model="newPinDigits"
              id-prefix="profile-pin"
              test-id-prefix="profile-pin-digit"
              digit-class="w-12 h-12 text-center text-xl border border-gray-600 rounded-md bg-gray-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              @submit="savePin"
            />
          </div>
          <div class="flex justify-center">
            <button
              type="button"
              data-testid="profile-pin-action"
              @click="savePin"
              :disabled="savingPin"
              class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {{ hasPin ? 'Change PIN' : 'Add PIN' }}
            </button>
          </div>
          <p
            v-if="pinFeedback"
            data-testid="profile-pin-feedback"
            :class="pinFeedbackError ? 'text-red-400' : 'text-green-400'"
            class="text-xs mt-1 text-center"
          >{{ pinFeedback }}</p>
        </div>

        <p
          data-testid="encourage-both-hint"
          class="text-xs text-gray-400 text-center px-2"
        >
          Tip: set both a password and a PIN — if an admin disables PINs,
          your password is still a working login.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { Beanhead } from 'beanheads-vue';
import { useSession } from '~/composables/useSession';
import PinInput from './ui/PinInput.vue';

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
  isAdmin: 0
});

// Independent credential panels each maintain their own input state and
// feedback. Profile (name/avatar) save still flows through the form's
// submit handler below.
const newPasswordValue = ref('');
const newPinDigits = ref('');
const savingPassword = ref(false);
const savingPin = ref(false);
const passwordFeedback = ref('');
const passwordFeedbackError = ref(false);
const pinFeedback = ref('');
const pinFeedbackError = ref(false);

// allow_pin from /api/system-settings — controls whether the "Add PIN"
// panel is offered to users who don't already have one. Existing PIN
// holders always see the panel so they can rotate.
const allowPin = ref(true);

const { updateUserSettings } = useSession();

// Authentication state
const authState = ref({
  isLoading: true,
  hasPin: false,
  hasPassword: false
});

// Pulls auth-presence flags + the global allow_pin setting so the panels
// know what to label and whether to show the "Add PIN" panel.
const fetchUserAuthInfo = async () => {
  if (!props.user?.id) return;

  try {
    authState.value.isLoading = true;
    const [userResp, settingsResp] = await Promise.all([
      fetch(`/api/users/${props.user.id}`),
      fetch('/api/system-settings')
    ]);
    if (userResp.ok) {
      const userData = await userResp.json();
      authState.value.hasPin = userData.has_pin === 1;
      authState.value.hasPassword = userData.has_password === 1;
    }
    if (settingsResp.ok) {
      const s = await settingsResp.json();
      allowPin.value = s.allow_pin === true || s.allow_pin === 'true';
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

// Auth modality is derived from credential presence — there's no separate
// flag. authState is the canonical source.
const hasPin = computed(() => authState.value.hasPin);
const hasPassword = computed(() => authState.value.hasPassword);

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

// Initialize form with user data + reset cred panels.
watch(() => props.user, (newUser) => {
  if (!newUser) return;
  userData.value = {
    id: newUser.id,
    name: newUser.name,
    avatar: newUser.avatar,
    isAdmin: newUser.isAdmin
  };
  resetCredPanels();
  if (newUser.id) fetchUserAuthInfo();
}, { immediate: true });

function resetCredPanels() {
  newPasswordValue.value = '';
  newPinDigits.value = '';
  passwordFeedback.value = '';
  passwordFeedbackError.value = false;
  pinFeedback.value = '';
  pinFeedbackError.value = false;
}

// Profile (name + avatar) save — credentials are NOT touched here. The
// PUT body deliberately omits password/pin so the server's partial-update
// rule leaves them alone.
const updateUser = async () => {
  const userId = userData.value.id || props.user.id;
  if (!userId) return;
  const result = await updateUserSettings({
    id: userId,
    name: userData.value.name,
    avatar: userData.value.avatar
  });
  if (result.success) {
    emit('updated', result.user);
    emit('close');
  } else {
    console.error('Failed to update profile:', result.message);
  }
};

async function savePassword() {
  if (!newPasswordValue.value) return;
  passwordFeedback.value = '';
  passwordFeedbackError.value = false;
  savingPassword.value = true;
  try {
    const userId = userData.value.id || props.user.id;
    const result = await updateUserSettings({
      id: userId,
      name: userData.value.name,
      password: newPasswordValue.value
    });
    if (result.success) {
      passwordFeedback.value = hasPassword.value ? 'Password updated.' : 'Password saved.';
      newPasswordValue.value = '';
      authState.value.hasPassword = true;
    } else {
      passwordFeedback.value = result.message || 'Could not save password.';
      passwordFeedbackError.value = true;
    }
  } finally {
    savingPassword.value = false;
  }
}

async function savePin() {
  pinFeedback.value = '';
  pinFeedbackError.value = false;
  const pin = newPinDigits.value;
  if (!/^\d{4}$/.test(pin)) {
    pinFeedback.value = 'PIN must be exactly 4 digits.';
    pinFeedbackError.value = true;
    return;
  }
  savingPin.value = true;
  try {
    const userId = userData.value.id || props.user.id;
    const result = await updateUserSettings({
      id: userId,
      name: userData.value.name,
      pin
    });
    if (result.success) {
      pinFeedback.value = hasPin.value ? 'PIN updated.' : 'PIN saved.';
      newPinDigits.value = '';
      authState.value.hasPin = true;
    } else {
      pinFeedback.value = result.message || 'Could not save PIN.';
      pinFeedbackError.value = true;
    }
  } finally {
    savingPin.value = false;
  }
}

const close = () => {
  emit('close');
};

// Backdrop / X close path that respects in-flight credential saves so an
// accidental click-out can't hide a failed savePassword / savePin response
// (the async handler would later write feedback into a closed modal).
function tryClose() {
  if (savingPassword.value || savingPin.value) return;
  close();
}
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
