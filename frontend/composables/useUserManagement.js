import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSession } from './useSession';

export function useUserManagement() {
  const router = useRouter();
  const { login } = useSession();

  // User state
  const users = ref([]);
  const isLoading = ref(false);
  const error = ref(null);
  const hasAdmin = ref(false);
  
  // User selection state
  const selectedUser = ref(null);
  const showAuthModal = ref(false);
  const authError = ref('');
  const isAuthenticating = ref(false);
  const pinDigits = ref('');
  const authData = ref({ password: '', pin: '' });

  // Phase 3: surfaces the SetCredentialsModal for legacy no-creds users
  // (mode='bootstrap') and PIN-only users locked out by allow_pin=false
  // (mode='post-login'). The modal is rendered by the parent screen.
  const showSetCredentialsModal = ref(false);
  const setCredentialsMode = ref(null); // 'bootstrap' | 'post-login' | null

  // Phase 3: cached system-settings snapshot. Refreshed on init and after
  // any settings change. Read by the signup form to hide the PIN field
  // when allow_pin is false.
  const systemSettings = ref({ allow_pin: true, auto_approve_new_users: false, allow_user_registration: true });

  const fetchSystemSettings = async () => {
    try {
      const r = await fetch('/api/system-settings');
      if (!r.ok) return systemSettings.value;
      const data = await r.json();
      systemSettings.value = {
        allow_pin: (data.allow_pin ?? 'true') === 'true',
        auto_approve_new_users: (data.auto_approve_new_users ?? 'false') === 'true',
        allow_user_registration: (data.allow_user_registration ?? 'true') === 'true'
      };
      return systemSettings.value;
    } catch (err) {
      console.warn('Could not fetch /api/system-settings:', err.message);
      return systemSettings.value;
    }
  };
  
  // User creation state
  const showCreateUser = ref(false);
  const newUser = ref({ name: '', avatar: '', password: '', pin: '' });
  const isCreating = ref(false);
  const createError = ref('');
  const authType = ref('password');
  const createPinDigits = ref('');

  const fetchUsers = async () => {
    try {
      isLoading.value = true;
      error.value = null;
      
      const response = await fetch('/api/users');
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      users.value = Array.isArray(data) ? data : [];
      hasAdmin.value = users.value.some(user => user.isAdmin === 1);
      
      return users.value;
    } catch (err) {
      console.error('Error fetching users:', err);
      error.value = err.message;
      return [];
    } finally {
      isLoading.value = false;
    }
  };

  const selectUser = async (user) => {
    try {
      selectedUser.value = user;
      pinDigits.value = '';

      // Refresh allow_pin before computing the picker matrix — if an admin
      // toggled the setting while the picker page was open, a cached
      // value would briefly show PIN as an option to a both-creds user
      // even though the server now rejects PIN auth for them.
      await fetchSystemSettings();

      // Phase 2: every user must have a password or PIN — fetch the
      // auth-presence flags so the modal can pick between password and PIN.
      const response = await fetch(`/api/users/${user.id}`);
      if (response.ok) {
        const userData = await response.json();
        const allowPin = systemSettings.value.allow_pin !== false;
        const userHasPin = userData.has_pin === 1;
        const userHasPassword = userData.has_password === 1;
        // PIN auth is offered whenever the user actually has a PIN AND it
        // would be accepted by the server: allow_pin=true OR the user has
        // no password (the one-time bridge so a PIN-only user with
        // disabled PINs can still get in and be walked through adding a
        // password). Hiding the PIN input from a PIN-only user when
        // allow_pin=false used to silently route them into bootstrap mode
        // even though their PIN is perfectly valid as a bridge.
        const canUsePin = userHasPin && (allowPin || !userHasPassword);
        selectedUser.value = {
          ...userData,
          pin: canUsePin,
          password: userHasPassword
        };
      }

      // True bootstrap case: legacy account with neither password NOR PIN.
      // Walks them through setting credentials via the bootstrap-credentials
      // endpoint, which also issues a session.
      if (selectedUser.value && !selectedUser.value.password && !selectedUser.value.pin) {
        setCredentialsMode.value = 'bootstrap';
        showSetCredentialsModal.value = true;
        return;
      }

      showAuthModal.value = true;
      authData.value = { password: '', pin: '' };
      authError.value = '';
      return { success: true };
    } catch (error) {
      console.error('Error selecting user:', error);
      return { success: false, message: error.message };
    }
  };

  // Called by the SetCredentialsModal on a successful submit (both modes).
  // For bootstrap mode the server already set our session cookie, so we
  // just refresh local session state and route to /courses.
  const finishCredentialUpdate = async (response) => {
    showSetCredentialsModal.value = false;
    setCredentialsMode.value = null;
    if (response?.user) {
      // useSession exposes setUser via login() flow normally; we set state
      // directly here since the cookie was already issued by the bootstrap
      // endpoint.
      const session = useSession();
      session.setUser({
        ...response.user,
        // setUser expects is_active on the user object (already there from
        // the API response).
      });
    }
    router.push('/courses');
  };

  // Caller passes 'pin' or 'password' to declare which input it sourced
  // from. Defaults to whichever the user has set up — for a both-creds
  // user the page picks an explicit default and surfaces a toggle.
  const authenticateUser = async (mode) => {
    try {
      isAuthenticating.value = true;

      const resolvedMode = mode || (selectedUser.value?.pin ? 'pin' : 'password');
      const credentials = {};

      if (resolvedMode === 'pin') {
        const enteredPin = pinDigits.value;
        if (enteredPin.length !== 4) {
          authError.value = 'Please enter all 4 digits of your PIN';
          return;
        }
        credentials.pin = enteredPin;
      } else {
        if (!authData.value.password) {
          authError.value = 'Please enter your password';
          return;
        }
        credentials.password = authData.value.password;
      }

      const result = await login(selectedUser.value.id, credentials);

      if (!result.success) {
        authError.value = result.message || 'Invalid credentials';
        return;
      }

      showAuthModal.value = false;

      // Phase 3: if the server told us the user needs to upgrade their
      // credentials (e.g. PIN-only user, allow_pin=false), surface the
      // post-login modal before navigating onward.
      if (result.needsCredentialUpdate === 'pin_disabled') {
        setCredentialsMode.value = 'post-login';
        showSetCredentialsModal.value = true;
        return;
      }

      router.push('/courses');
    } catch (error) {
      console.error('Error during authentication:', error);
      authError.value = 'An error occurred during authentication';
    } finally {
      isAuthenticating.value = false;
    }
  };

  const createUser = async (userData) => {
    try {
      isCreating.value = true;
      createError.value = '';
      
      // Validate input
      if (!userData?.name?.trim()) {
        throw new Error('Username is required');
      }
      
      // Server ignores body.isAdmin on signup (admin promotion happens via
      // the admin-gated PUT endpoint) and requires at least one of password
      // / pin.
      const requestData = {
        name: userData.name.trim(),
        avatar: userData.avatar || null,
        password: userData.password || null,
        pin: userData.pin || null
      };
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create user');
      }
      
      const data = await response.json();
      if (!data?.id) throw new Error('Failed to create user');
      
      // Update local state
      await fetchUsers();
      newUser.value = { name: '', avatar: '', password: '', pin: '' };
      showCreateUser.value = false;
      createError.value = '';
      
      return data;
    } catch (error) {
      console.error('Error creating user:', error);
      createError.value = error.message;
      throw error;
    } finally {
      isCreating.value = false;
    }
  };

  // Initialize
  if (import.meta.client && users.value.length === 0) {
    fetchUsers();
    fetchSystemSettings();
  }

  return {
    // State
    users,
    isLoading,
    error,
    hasAdmin,
    selectedUser,
    showAuthModal,
    authError,
    isAuthenticating,
    pinDigits,
    authData,
    showCreateUser,
    newUser,
    isCreating,
    createError,
    authType,
    createPinDigits,
    showSetCredentialsModal,
    setCredentialsMode,
    systemSettings,

    // Methods
    fetchUsers,
    fetchSystemSettings,
    selectUser,
    authenticateUser,
    createUser,
    finishCredentialUpdate
  };
}
