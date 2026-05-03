<template>
  <div v-if="show" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50">
    <div class="bg-gray-800 text-white rounded-lg shadow-lg max-w-md w-full p-6">
      <h2 class="text-xl font-bold mb-2">{{ titleText }}</h2>
      <p class="text-gray-300 text-sm mb-4">{{ explainerText }}</p>

      <form @submit.prevent="onSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1" for="set-creds-pwd">Password</label>
          <input
            id="set-creds-pwd"
            v-model="password"
            type="password"
            autocomplete="new-password"
            :required="passwordRequired"
            class="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter a password"
          />
        </div>

        <div v-if="allowPin">
          <label class="block text-sm font-medium text-gray-300 mb-1" for="set-creds-pin">
            PIN <span class="text-gray-500">(4 digits, optional)</span>
          </label>
          <input
            id="set-creds-pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            maxlength="4"
            pattern="[0-9]{4}"
            autocomplete="off"
            class="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional"
          />
          <p class="mt-1 text-xs text-gray-400">{{ encourageBothHint }}</p>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-400">{{ errorMessage }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <button
            v-if="dismissible"
            type="button"
            class="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500"
            :disabled="submitting"
            @click="$emit('dismiss')"
          >Later</button>
          <button
            type="submit"
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
            :disabled="!canSubmit || submitting"
          >{{ submitting ? 'Saving…' : submitButtonText }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// Shared modal for two upgrade scenarios:
//   mode="bootstrap"   — legacy user with no password and no PIN. Submits to
//                        /api/users/bootstrap-credentials (which also issues
//                        a session cookie) and the parent should treat the
//                        success as "user is now logged in".
//   mode="post-login"  — user is already logged in but the server flagged
//                        needsCredentialUpdate (e.g. PIN-only user when
//                        admin globally disabled PINs). Submits to PUT
//                        /api/users to set a password.
const props = defineProps({
  show:        { type: Boolean, default: false },
  mode:        { type: String,  required: true },     // 'bootstrap' | 'post-login'
  user:        { type: Object,  required: true },     // { id, name, ... }
  allowPin:    { type: Boolean, default: true },
  dismissible: { type: Boolean, default: false }      // post-login: false (we want to nudge, not block)
});

const emit = defineEmits(['success', 'dismiss']);

const password = ref('');
const pin = ref('');
const submitting = ref(false);
const errorMessage = ref('');

const passwordRequired = computed(() => {
  // post-login + pin_disabled: a password is the whole point.
  if (props.mode === 'post-login') return true;
  // bootstrap: at least one of pwd/pin must be set; if PINs are off, password is the only option.
  if (!props.allowPin) return true;
  return false;
});

const canSubmit = computed(() => {
  if (props.mode === 'post-login') return !!password.value;
  if (!props.allowPin) return !!password.value;
  return !!password.value || (!!pin.value && pin.value.length === 4);
});

const titleText = computed(() => {
  if (props.mode === 'bootstrap') return 'Set credentials for your account';
  return 'Set a password to continue';
});

const explainerText = computed(() => {
  if (props.mode === 'bootstrap') {
    return 'For security, this version no longer supports profiles without a password or PIN. ' +
      'Pick one (both recommended) to keep using your account.';
  }
  return 'PINs have been disabled on this instance. Set a password before continuing — ' +
    'your existing PIN will stop working.';
});

const submitButtonText = computed(() => props.mode === 'bootstrap' ? 'Save and sign in' : 'Save password');

const encourageBothHint = computed(() => {
  if (props.mode !== 'bootstrap') return '';
  return 'Tip: setting both gives you a fast PIN for daily use and a password fallback if PINs are ever disabled.';
});

// Reset state when the modal is shown for a new user.
watch(() => props.show, (v) => {
  if (v) {
    password.value = '';
    pin.value = '';
    errorMessage.value = '';
    submitting.value = false;
  }
});

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return;
  errorMessage.value = '';
  submitting.value = true;
  try {
    const pinValue = props.allowPin && pin.value && pin.value.length === 4 ? pin.value : null;
    if (props.mode === 'bootstrap') {
      const res = await $fetch('/api/users/bootstrap-credentials', {
        method: 'POST',
        body: {
          userId: props.user.id,
          password: password.value || null,
          pin: pinValue
        }
      });
      if (res?.success) emit('success', res);
      else errorMessage.value = 'Could not save credentials. Please try again.';
    } else {
      // post-login: caller already has a session, so PUT /api/users works
      // for self-edit. Set the new password AND clear the PIN — under
      // pin_disabled mode the PIN must stop working entirely once the
      // user has a password fallback.
      const res = await $fetch('/api/users', {
        method: 'PUT',
        body: {
          id: props.user.id,
          name: props.user.name,
          password: password.value,
          pin: null
        }
      });
      if (res?.id) emit('success', res);
      else errorMessage.value = 'Could not save credentials. Please try again.';
    }
  } catch (err) {
    errorMessage.value =
      err?.data?.statusMessage || err?.statusMessage || err?.message ||
      'Could not save credentials.';
  } finally {
    submitting.value = false;
  }
}
</script>
