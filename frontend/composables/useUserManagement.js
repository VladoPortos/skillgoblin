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
  const pinDigits = ref(['', '', '', '']);
  const authData = ref({ password: '', pin: '' });
  
  // User creation state
  const showCreateUser = ref(false);
  const newUser = ref({ name: '', avatar: '', password: '', pin: '' });
  const isCreating = ref(false);
  const createError = ref('');
  const useAuth = ref(false);
  const authType = ref('password');
  const createPinDigits = ref(['', '', '', '']);
  const isAdminCheckbox = ref(false);

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
      pinDigits.value = ['', '', '', ''];
      
      if (user.use_auth === 1) {
        const response = await fetch(`/api/users/${user.id}`);
        if (response.ok) {
          const userData = await response.json();
          selectedUser.value = {
            ...userData,
            pin: userData.has_pin === 1,
            password: userData.has_password === 1
          };
        }
        showAuthModal.value = true;
        authData.value = { password: '', pin: '' };
        authError.value = '';
      } else {
        const result = await login(user.id);
        if (result.success) router.push('/courses');
      }
    } catch (error) {
      console.error('Error selecting user:', error);
      throw error;
    }
  };

  const authenticateUser = async () => {
    try {
      isAuthenticating.value = true;
      
      if (selectedUser.value?.pin) {
        const enteredPin = pinDigits.value.join('');
        if (enteredPin.length !== 4) {
          authError.value = 'Please enter all 4 digits of your PIN';
          return;
        }
        authData.value.pin = enteredPin;
      } else if (!authData.value.password) {
        authError.value = 'Please enter your password';
        return;
      }

      const result = await login(selectedUser.value.id, authData.value);
      
      if (result.success) {
        showAuthModal.value = false;
        router.push('/courses');
      } else {
        authError.value = result.message || 'Invalid credentials';
      }
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
      
      // Prepare request data
      const requestData = {
        name: userData.name.trim(),
        avatar: userData.avatar || null,
        password: userData.password || null,
        pin: userData.pin || null,
        use_auth: useAuth.value ? 1 : 0,
        isAdmin: isAdminCheckbox.value ? 1 : 0
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
  if (process.client && users.value.length === 0) {
    fetchUsers();
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
    useAuth,
    authType,
    createPinDigits,
    isAdminCheckbox,
    
    // Methods
    fetchUsers,
    selectUser,
    authenticateUser,
    createUser
  };
}
