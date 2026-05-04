<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
    @click.self="tryDismiss"
  >
    <div class="bg-gray-800 text-white rounded-lg shadow-lg max-w-md w-full p-6 relative">
      <button
        type="button"
        class="absolute top-3 right-3 text-gray-400 hover:text-white disabled:opacity-50"
        aria-label="Close"
        data-testid="set-creds-close"
        :disabled="submitting"
        @click="tryDismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <h2 class="text-xl font-bold mb-2 pr-8" data-testid="set-creds-title">{{ titleText }}</h2>
      <p class="text-gray-300 text-sm mb-4" data-testid="set-creds-explainer">{{ explainerText }}</p>

      <form @submit.prevent="onSubmit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1" for="set-creds-pwd">
            {{ mode === 'bootstrap' ? 'Password' : 'New password' }}
          </label>
          <input
            id="set-creds-pwd"
            v-model="password"
            type="password"
            autocomplete="new-password"
            data-testid="set-creds-password"
            :required="passwordRequired"
            class="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            :placeholder="mode === 'bootstrap' ? 'Enter a password' : 'Pick a password'"
          />
        </div>

        <!-- Verify-password input — only in post-login mode where we're
             setting a password the user has never typed before. Bootstrap
             mode skips it because the user can also opt to set just a PIN. -->
        <div v-if="mode === 'post-login'">
          <label class="block text-sm font-medium text-gray-300 mb-1" for="set-creds-pwd-verify">
            Verify password
          </label>
          <input
            id="set-creds-pwd-verify"
            v-model="passwordVerify"
            type="password"
            autocomplete="new-password"
            data-testid="set-creds-password-verify"
            required
            class="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Type it again to confirm"
          />
          <p v-if="password && passwordVerify && password !== passwordVerify" class="mt-1 text-xs text-red-400">
            Passwords don't match.
          </p>
        </div>

        <div v-if="mode === 'bootstrap' && allowPin">
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
            data-testid="set-creds-pin"
            class="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional"
          />
          <p class="mt-1 text-xs text-gray-400">{{ encourageBothHint }}</p>
        </div>

        <p v-if="errorMessage" class="text-sm text-red-400" data-testid="set-creds-error">{{ errorMessage }}</p>

        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            class="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500"
            data-testid="set-creds-later"
            :disabled="submitting"
            @click="$emit('dismiss')"
          >Later</button>
          <button
            type="submit"
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
            data-testid="set-creds-submit"
            :disabled="!canSubmit || submitting"
          >{{ submitting ? 'Saving…' : submitButtonText }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// Two upgrade scenarios:
//   mode="bootstrap"   — legacy account with neither password nor PIN.
//                        Submits to /api/users/bootstrap-credentials, which
//                        also issues a session.
//   mode="post-login"  — user authenticated with their PIN as a one-time
//                        bridge under allow_pin=false. They're already
//                        logged in; the modal nudges them to set a password
//                        so future logins work after the PIN bridge stops.
//                        The existing PIN row is left in place so it would
//                        work again if the operator re-enables PINs.
const props = defineProps({
  show:        { type: Boolean, default: false },
  mode:        { type: String,  required: true },     // 'bootstrap' | 'post-login'
  user:        { type: Object,  required: true },     // { id, name, ... }
  allowPin:    { type: Boolean, default: true }
});

const emit = defineEmits(['success', 'dismiss']);

const password = ref('');
const passwordVerify = ref('');
const pin = ref('');
const submitting = ref(false);
const errorMessage = ref('');

const passwordRequired = computed(() => {
  if (props.mode === 'post-login') return true;
  if (!props.allowPin) return true;
  return false;
});

const canSubmit = computed(() => {
  if (props.mode === 'post-login') {
    return !!password.value && password.value === passwordVerify.value;
  }
  if (!props.allowPin) return !!password.value;
  return !!password.value || (!!pin.value && pin.value.length === 4);
});

const titleText = computed(() => {
  if (props.mode === 'bootstrap') return 'Set credentials for your account';
  return 'Set a password to keep using this account';
});

const explainerText = computed(() => {
  if (props.mode === 'bootstrap') {
    return 'For security, this version no longer supports profiles without a password or PIN. ' +
      'Pick one (both recommended) to keep using your account.';
  }
  // post-login: PIN-only user signed in with their PIN as a bridge under
  // disabled-PIN policy. Be honest about who disabled what.
  return 'Administrators have disabled PIN-only login on this instance. ' +
    'Set a password to keep using your account — your PIN stays set in case ' +
    'PINs get re-enabled later.';
});

const submitButtonText = computed(() => props.mode === 'bootstrap' ? 'Save and sign in' : 'Save password');

const encourageBothHint = computed(() => {
  if (props.mode !== 'bootstrap') return '';
  return 'Tip: setting both gives you a fast PIN for daily use and a password fallback if PINs are ever disabled.';
});

// Reset state on each open (avoids carry-over between users).
watch(() => props.show, (v) => {
  if (v) {
    password.value = '';
    passwordVerify.value = '';
    pin.value = '';
    errorMessage.value = '';
    submitting.value = false;
  }
});

// Shared dismiss path for the X button and the backdrop — both must be
// blocked while a save is in flight (otherwise the parent could route to
// /courses while the PUT response is still pending and hide a failure).
function tryDismiss() {
  if (submitting.value) return;
  emit('dismiss');
}

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
      // post-login bridge: caller already has a session (PIN bridge auth
      // succeeded). Set the password and intentionally do NOT touch the
      // PIN row — leave the user's PIN in place. It can't be used while
      // allow_pin=false (server rejects), but stays valid if the operator
      // re-enables PINs later.
      const res = await $fetch('/api/users', {
        method: 'PUT',
        body: {
          id: props.user.id,
          name: props.user.name,
          password: password.value
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
