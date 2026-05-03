// useSession — cookie-backed session client.
//
// Phase 2 changed the source of truth for "who is logged in" from
// localStorage.userId to a HttpOnly session cookie issued by /api/users/auth.
// This composable still exposes the same useState refs for the UI, but they
// are populated from /api/auth/me on app start (via plugins/auth.js) and
// from the response body of /api/users/auth on login.
//
// Note for callers: every fetch that needs auth must include credentials.
// $fetch in Nuxt 3 sends same-origin cookies by default, so as long as
// the API is on the same origin nothing extra is required.

export const useSession = () => {
  const userId = useState('userId', () => null);
  const userName = useState('userName', () => '');
  const userAvatar = useState('userAvatar', () => '');
  const isAuthenticated = useState('isAuthenticated', () => false);
  const isAdmin = useState('isAdmin', () => false);
  const isActive = useState('isActive', () => false);

  const user = computed(() => {
    if (!userId.value) return null;
    return {
      id: userId.value,
      name: userName.value,
      avatar: userAvatar.value,
      isAdmin: isAdmin.value ? 1 : 0,
      is_active: isActive.value ? 1 : 0
    };
  });

  const router = useRouter();

  const setUser = (u) => {
    if (!u) return;
    userId.value = u.id;
    userName.value = u.name;
    userAvatar.value = u.avatar;
    isAdmin.value = u.isAdmin === 1;
    isActive.value = u.is_active === 1;
    isAuthenticated.value = true;
  };

  const clearUser = () => {
    userId.value = null;
    userName.value = '';
    userAvatar.value = '';
    isAuthenticated.value = false;
    isAdmin.value = false;
    isActive.value = false;
  };

  // Two flavors:
  //   login(id, { password? | pin? }) — verify against the picked profile
  // The server sets the session cookie on success; we just mirror the user
  // info from the response into local state.
  const login = async (id, authData = null) => {
    try {
      const result = await $fetch('/api/users/auth', {
        method: 'POST',
        body: { userId: id, ...(authData || {}) }
      });

      if (!result?.success) {
        return { success: false, message: result?.message || 'Authentication failed' };
      }
      if (result.user) setUser(result.user);
      // Pass through the Phase 3 needsCredentialUpdate signal so callers
      // can route the user into the SetCredentialsModal post-login flow.
      return { success: true, needsCredentialUpdate: result.needsCredentialUpdate || null };
    } catch (error) {
      console.error('Login error:', error);
      const message = error?.data?.statusMessage || error?.statusMessage || error.message;
      return { success: false, message };
    }
  };

  const logout = async () => {
    try {
      await $fetch('/api/users/logout', { method: 'POST' });
    } catch (error) {
      console.warn('Logout request failed (continuing anyway):', error);
    }
    clearUser();
    router.push('/');
  };

  // Called once on app start by plugins/auth.js. Re-establishes user state
  // from the session cookie. Returns success regardless of whether a session
  // exists; the caller checks isAuthenticated to decide what to render.
  const checkAuth = async () => {
    try {
      const result = await $fetch('/api/auth/me');
      if (result?.user) {
        setUser(result.user);
        return { success: true };
      }
    } catch (error) {
      // 401 here is expected when no session exists. Stay logged out.
    }
    clearUser();
    return { success: false };
  };

  const updateUserSettings = async (settings) => {
    if (!userId.value) return { success: false, message: 'Not logged in' };
    try {
      const updated = await $fetch('/api/users', {
        method: 'PUT',
        body: { ...settings, id: settings.id || userId.value }
      });
      if (updated?.id) {
        setUser(updated);
        return { success: true, user: updated };
      }
      return { success: false, message: 'Failed to update user' };
    } catch (error) {
      console.error('Error updating user:', error);
      const message = error?.data?.statusMessage || error?.statusMessage || error.message;
      return { success: false, message };
    }
  };

  const deleteAccount = async () => {
    if (!userId.value) return { success: false, message: 'Not logged in' };
    try {
      const response = await $fetch('/api/users/delete', {
        method: 'POST',
        body: { userId: userId.value }
      });
      if (response?.success) {
        clearUser();
        router.push('/');
        return { success: true };
      }
      return { success: false, message: response?.message || 'Failed to delete account' };
    } catch (error) {
      console.error('Error deleting account:', error);
      const message = error?.data?.statusMessage || error?.statusMessage || error.message;
      return { success: false, message };
    }
  };

  return {
    userId,
    userName,
    userAvatar,
    isAuthenticated,
    isAdmin,
    isActive,
    user,
    setUser,
    login,
    logout,
    checkAuth,
    updateUserSettings,
    deleteAccount
  };
};
