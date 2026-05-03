<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto custom-scrollbar"
    data-testid="admin-panel"
  >
    <div class="bg-gray-800 rounded-lg shadow-lg max-w-5xl w-full p-6 my-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-white">Admin Panel</h2>
        <button @click="close" class="text-gray-400 hover:text-white" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex border-b border-gray-700 mb-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :data-testid="`admin-tab-${tab.id}`"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium',
            activeTab === tab.id
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          ]"
        >{{ tab.label }}</button>
      </div>

      <!-- Users tab -->
      <div v-if="activeTab === 'users'" class="space-y-3">
        <div class="flex items-center gap-2">
          <button
            data-testid="filter-pending"
            @click="filterPending = !filterPending"
            :class="[
              'px-3 py-1 text-xs rounded border',
              filterPending
                ? 'bg-orange-700 border-orange-600 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
            ]"
          >Pending only</button>
          <span v-if="filterPending" class="text-xs text-gray-400">
            Showing only inactive accounts.
          </span>
        </div>
        <div v-if="actionError" class="text-red-400 text-sm" data-testid="action-error">{{ actionError }}</div>
        <div v-if="loading" class="text-gray-400 text-sm">Loading users…</div>
        <div v-else-if="loadError" class="text-red-400 text-sm">{{ loadError }}</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm text-left text-gray-300" data-testid="users-table">
            <thead class="text-xs uppercase text-gray-400 border-b border-gray-700">
              <tr>
                <th class="py-2 pr-4">Name</th>
                <th class="py-2 pr-4">Role</th>
                <th class="py-2 pr-4">Status</th>
                <th class="py-2 pr-4">Auth</th>
                <th class="py-2 pr-4">Created</th>
                <th class="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="u in displayedUsers"
                :key="u.id"
                class="border-b border-gray-700/50 align-top"
                :data-testid="`user-row-${u.id}`"
              >
                <td class="py-2 pr-4 text-white">{{ u.name }}</td>
                <td class="py-2 pr-4">
                  <span v-if="u.isAdmin" class="text-yellow-400">admin</span>
                  <span v-else class="text-gray-400">user</span>
                </td>
                <td class="py-2 pr-4">
                  <span v-if="u.is_active" class="text-green-400">active</span>
                  <span v-else class="text-orange-400">pending</span>
                </td>
                <td class="py-2 pr-4 text-xs text-gray-400">
                  <span v-if="u.has_password">pw</span>
                  <span v-if="u.has_password && u.has_pin"> + </span>
                  <span v-if="u.has_pin">pin</span>
                  <span v-if="!u.has_password && !u.has_pin" class="text-red-400">none</span>
                </td>
                <td class="py-2 pr-4 text-xs text-gray-500">{{ formatDate(u.created_at) }}</td>
                <td class="py-2 pr-4 text-right">
                  <div class="flex flex-wrap justify-end gap-1">
                    <button
                      v-if="!u.is_active"
                      class="px-2 py-1 text-xs bg-green-700 text-white rounded hover:bg-green-600"
                      @click="toggleActive(u, true)"
                    >Activate</button>
                    <button
                      v-else
                      class="px-2 py-1 text-xs bg-orange-700 text-white rounded hover:bg-orange-600"
                      @click="toggleActive(u, false)"
                    >Deactivate</button>

                    <button
                      v-if="!u.isAdmin"
                      class="px-2 py-1 text-xs bg-yellow-700 text-white rounded hover:bg-yellow-600"
                      @click="toggleAdmin(u, true)"
                    >Promote</button>
                    <button
                      v-else
                      class="px-2 py-1 text-xs bg-yellow-900 text-white rounded hover:bg-yellow-800"
                      @click="toggleAdmin(u, false)"
                    >Demote</button>

                    <button
                      class="px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600"
                      @click="openReset(u.id, 'password')"
                    >Reset pwd</button>
                    <button
                      class="px-2 py-1 text-xs bg-blue-900 text-white rounded hover:bg-blue-800"
                      @click="openReset(u.id, 'pin')"
                    >Reset pin</button>

                    <button
                      class="px-2 py-1 text-xs bg-indigo-700 text-white rounded hover:bg-indigo-600"
                      @click="openSessions(u)"
                    >Sessions</button>

                    <button
                      class="px-2 py-1 text-xs bg-purple-700 text-white rounded hover:bg-purple-600"
                      @click="askKick(u)"
                    >Kick</button>

                    <button
                      class="px-2 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-600"
                      @click="askDelete(u)"
                    >Delete</button>
                  </div>

                  <!-- Inline credential reset form -->
                  <div v-if="resetForUser === u.id" class="mt-2 flex justify-end gap-1">
                    <input
                      v-model="resetValue"
                      :type="resetKind === 'pin' ? 'text' : 'password'"
                      :placeholder="resetKind === 'pin' ? 'New 4-digit PIN' : 'New password'"
                      class="px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600"
                      data-testid="reset-input"
                    />
                    <button
                      class="px-2 py-1 text-xs bg-blue-700 text-white rounded hover:bg-blue-600"
                      data-testid="reset-submit"
                      @click="submitReset(u)"
                    >Save</button>
                    <button
                      class="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600"
                      @click="cancelReset"
                    >Cancel</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="activeTab === 'settings'" class="space-y-4 text-gray-200">
        <div v-if="settingsLoading" class="text-gray-400 text-sm">Loading settings…</div>
        <div v-else-if="settingsError" class="text-red-400 text-sm">{{ settingsError }}</div>
        <template v-else>
          <label class="flex items-start gap-3">
            <input
              type="checkbox"
              v-model="settings.allow_pin"
              data-testid="settings-allow-pin"
              class="mt-1"
            />
            <span>
              <span class="block font-medium">Allow PIN authentication</span>
              <span class="block text-xs text-gray-400">
                When off, new signups must use a password and existing PIN-only users
                are prompted to add a password on next login.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-3">
            <input
              type="checkbox"
              v-model="settings.auto_approve_new_users"
              data-testid="settings-auto-approve"
              class="mt-1"
            />
            <span>
              <span class="block font-medium">Auto-approve new signups</span>
              <span class="block text-xs text-gray-400">
                When off (default), new accounts are inactive until an admin
                activates them from the Users tab.
              </span>
            </span>
          </label>

          <div class="flex items-center gap-3 pt-2">
            <button
              class="px-3 py-2 text-sm bg-blue-700 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              :disabled="settingsSaving"
              data-testid="settings-save"
              @click="saveSettings"
            >{{ settingsSaving ? 'Saving…' : 'Save' }}</button>
            <span v-if="settingsSaved" class="text-sm text-green-400" data-testid="settings-saved">Saved.</span>
            <span v-if="settingsSaveError" class="text-sm text-red-400">{{ settingsSaveError }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Sessions drilldown -->
    <div
      v-if="sessionsTarget"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
      data-testid="sessions-drilldown"
    >
      <div class="bg-gray-800 rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-white">
            Sessions — {{ sessionsTarget.name }}
          </h3>
          <button @click="sessionsTarget = null" class="text-gray-400 hover:text-white" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="sessionsLoading" class="text-gray-400 text-sm">Loading sessions…</div>
        <div v-else-if="sessionsError" class="text-red-400 text-sm">{{ sessionsError }}</div>
        <template v-else>
          <div v-if="sessionsList.length === 0" class="text-gray-400 text-sm py-4 text-center">
            No active sessions.
          </div>
          <table v-else class="w-full text-sm text-left text-gray-300 mb-4">
            <thead class="text-xs uppercase text-gray-400 border-b border-gray-700">
              <tr>
                <th class="py-2 pr-4">User-Agent</th>
                <th class="py-2 pr-4">Created</th>
                <th class="py-2 pr-4">Last seen</th>
                <th class="py-2 pr-4">Expires</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(s, i) in sessionsList"
                :key="i"
                class="border-b border-gray-700/50"
                data-testid="session-row"
              >
                <td class="py-2 pr-4 truncate max-w-[20rem]">{{ s.user_agent || '—' }}</td>
                <td class="py-2 pr-4 text-xs text-gray-400">{{ formatDate(s.created_at) }}</td>
                <td class="py-2 pr-4 text-xs text-gray-400">{{ formatDate(s.last_seen_at) }}</td>
                <td class="py-2 pr-4 text-xs text-gray-400">{{ formatDate(s.expires_at) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="flex justify-end">
            <button
              v-if="sessionsList.length > 0"
              class="px-3 py-2 text-sm bg-purple-700 text-white rounded hover:bg-purple-600"
              data-testid="drilldown-kick-all"
              @click="kickAllForTarget"
            >Kick all sessions</button>
          </div>
        </template>
      </div>
    </div>

    <!-- Kick confirmation -->
    <div
      v-if="kickTarget"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
    >
      <div class="bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 class="text-lg font-bold text-white mb-2">Kick all sessions</h3>
        <p class="text-gray-300 text-sm mb-4">
          Force-logout every active session for <strong>{{ kickTarget.name }}</strong>?
          They'll need to sign in again.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-600"
            @click="kickTarget = null"
          >Cancel</button>
          <button
            class="px-3 py-2 text-sm bg-purple-700 text-white rounded hover:bg-purple-600"
            @click="confirmKick"
          >Kick sessions</button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4"
    >
      <div class="bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 class="text-lg font-bold text-white mb-2">Delete user</h3>
        <p class="text-gray-300 text-sm mb-4">
          Permanently delete <strong>{{ deleteTarget.name }}</strong> and all their progress?
          This cannot be undone.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-600"
            @click="deleteTarget = null"
          >Cancel</button>
          <button
            class="px-3 py-2 text-sm bg-red-700 text-white rounded hover:bg-red-600"
            @click="confirmDelete"
          >Delete user</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';

const props = defineProps({
  show: { type: Boolean, required: true }
});
const emit = defineEmits(['close']);

const tabs = [
  { id: 'users', label: 'Users' },
  { id: 'settings', label: 'Settings' }
];
const activeTab = ref('users');

const users = ref([]);
const loading = ref(false);
const loadError = ref('');
const actionError = ref('');
const filterPending = ref(false);
const displayedUsers = computed(() =>
  filterPending.value ? users.value.filter(u => !u.is_active) : users.value
);

const resetForUser = ref(null);
const resetKind = ref('password');
const resetValue = ref('');

const kickTarget = ref(null);
const deleteTarget = ref(null);

const sessionsTarget = ref(null);
const sessionsList = ref([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');

const settings = ref({ allow_pin: true, auto_approve_new_users: false });
const settingsLoading = ref(false);
const settingsError = ref('');
const settingsSaving = ref(false);
const settingsSaved = ref(false);
const settingsSaveError = ref('');
let settingsLoaded = false;

async function loadUsers() {
  loading.value = true;
  loadError.value = '';
  try {
    const r = await fetch('/api/users');
    if (!r.ok) throw new Error(`Failed to load users (${r.status})`);
    users.value = await r.json();
  } catch (err) {
    loadError.value = err.message || 'Failed to load users';
  } finally {
    loading.value = false;
  }
}

async function callPut(body) {
  actionError.value = '';
  const r = await fetch('/api/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    let msg = `Action failed (${r.status})`;
    try { msg = (await r.json())?.statusMessage || msg; } catch {}
    actionError.value = msg;
    return false;
  }
  return true;
}

async function toggleActive(u, makeActive) {
  if (await callPut({ id: u.id, name: u.name, is_active: makeActive ? 1 : 0 })) {
    await loadUsers();
  }
}

async function toggleAdmin(u, makeAdmin) {
  if (await callPut({ id: u.id, name: u.name, isAdmin: makeAdmin ? 1 : 0 })) {
    await loadUsers();
  }
}

function openReset(userId, kind) {
  resetForUser.value = userId;
  resetKind.value = kind;
  resetValue.value = '';
}
function cancelReset() {
  resetForUser.value = null;
  resetValue.value = '';
}
async function submitReset(u) {
  if (!resetValue.value) return;
  // PINs are 4 digits; the login UI's split-input field can't enter anything
  // else, so a free-form admin reset to "abc" would lock the user out.
  if (resetKind.value === 'pin' && !/^\d{4}$/.test(resetValue.value)) {
    actionError.value = 'PIN must be exactly 4 digits';
    return;
  }
  const body = { id: u.id, name: u.name };
  body[resetKind.value] = resetValue.value;
  if (await callPut(body)) {
    cancelReset();
    await loadUsers();
  }
}

async function openSessions(u) {
  sessionsTarget.value = u;
  sessionsList.value = [];
  sessionsError.value = '';
  sessionsLoading.value = true;
  try {
    const r = await fetch(`/api/users/${u.id}/sessions`);
    if (!r.ok) throw new Error(`Failed to load sessions (${r.status})`);
    sessionsList.value = await r.json();
  } catch (err) {
    sessionsError.value = err.message || 'Failed to load sessions';
  } finally {
    sessionsLoading.value = false;
  }
}

async function kickAllForTarget() {
  const target = sessionsTarget.value;
  if (!target) return;
  const r = await fetch(`/api/users/${target.id}/kick-sessions`, { method: 'POST' });
  if (!r.ok) {
    let msg = `Kick failed (${r.status})`;
    try { msg = (await r.json())?.statusMessage || msg; } catch {}
    sessionsError.value = msg;
    return;
  }
  sessionsList.value = [];
}

function askKick(u) { kickTarget.value = u; }
async function confirmKick() {
  const target = kickTarget.value;
  kickTarget.value = null;
  if (!target) return;
  actionError.value = '';
  const r = await fetch(`/api/users/${target.id}/kick-sessions`, { method: 'POST' });
  if (!r.ok) {
    let msg = `Kick failed (${r.status})`;
    try { msg = (await r.json())?.statusMessage || msg; } catch {}
    actionError.value = msg;
  }
}

function askDelete(u) { deleteTarget.value = u; }
async function confirmDelete() {
  const target = deleteTarget.value;
  deleteTarget.value = null;
  if (!target) return;
  actionError.value = '';
  const r = await fetch('/api/users/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: target.id })
  });
  if (!r.ok) {
    let msg = `Delete failed (${r.status})`;
    try { msg = (await r.json())?.statusMessage || msg; } catch {}
    actionError.value = msg;
    return;
  }
  await loadUsers();
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString().slice(0, 10);
}

function coerceBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

async function loadSettings() {
  settingsLoading.value = true;
  settingsError.value = '';
  try {
    const r = await fetch('/api/system-settings');
    if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
    const body = await r.json();
    settings.value = {
      allow_pin: coerceBool(body.allow_pin),
      auto_approve_new_users: coerceBool(body.auto_approve_new_users)
    };
    settingsLoaded = true;
  } catch (err) {
    settingsError.value = err.message || 'Failed to load settings';
  } finally {
    settingsLoading.value = false;
  }
}

async function putSetting(key, value) {
  const r = await fetch('/api/system-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: !!value })
  });
  if (!r.ok) {
    let msg = `Save failed (${r.status})`;
    try { msg = (await r.json())?.statusMessage || msg; } catch {}
    throw new Error(msg);
  }
}

async function saveSettings() {
  settingsSaving.value = true;
  settingsSaved.value = false;
  settingsSaveError.value = '';
  // The endpoint accepts one {key, value} per call, so a multi-key save is
  // not atomic: if the second PUT fails, the first key is already changed.
  // Track which keys committed so we can be honest about partial state and
  // refresh the UI from the server's actual values.
  let committed = 0;
  try {
    await putSetting('allow_pin', settings.value.allow_pin);
    committed++;
    await putSetting('auto_approve_new_users', settings.value.auto_approve_new_users);
    committed++;
    settingsSaved.value = true;
  } catch (err) {
    settingsSaveError.value = committed > 0
      ? `${err.message || 'Save failed'} (${committed} change${committed > 1 ? 's' : ''} already saved before failure)`
      : (err.message || 'Save failed');
    // Re-sync UI with the server's actual state so the checkboxes don't lie.
    settingsLoaded = false;
    await loadSettings();
  } finally {
    settingsSaving.value = false;
  }
}

function close() {
  emit('close');
}

watch(activeTab, (tab) => {
  if (tab === 'settings' && !settingsLoaded) loadSettings();
});

onMounted(loadUsers);
</script>
