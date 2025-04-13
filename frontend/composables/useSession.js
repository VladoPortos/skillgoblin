export const useSession = () => {
  const userId = useState('userId', () => null);
  const userName = useState('userName', () => '');
  const userAvatar = useState('userAvatar', () => '');
  const isAuthenticated = useState('isAuthenticated', () => false);
  const useAuth = useState('useAuth', () => false);
  const isAdmin = useState('isAdmin', () => false);
  
  // Add a computed user object that combines the user properties
  const user = computed(() => {
    if (!userId.value) return null;
    return {
      id: userId.value,
      name: userName.value,
      avatar: userAvatar.value,
      use_auth: useAuth.value ? 1 : 0,
      isAdmin: isAdmin.value ? 1 : 0
    };
  });
  
  const router = useRouter();

  const setUser = (user) => {
    if (user) {
      userId.value = user.id;
      userName.value = user.name;
      userAvatar.value = user.avatar;
      useAuth.value = user.use_auth === 1;
      isAdmin.value = user.isAdmin === 1;
      isAuthenticated.value = true;
      localStorage.setItem('userId', user.id);
      console.log('User set:', user.id, user.name);
    }
  };

  const login = async (id, authData = null) => {
    try {
      console.log('Attempting to login user:', id);
      
      // Fetch user details using $fetch instead of useFetch
      const user = await $fetch(`/api/users/${id}`);
      
      if (!user) {
        console.error('User not found with ID:', id);
        throw new Error('User not found');
      }

      console.log('Found user:', user);

      // Check if user requires authentication
      if (user.use_auth === 1) {
        // If auth is required but no auth data provided, don't log in
        if (!authData) {
          return { 
            success: false, 
            requiresAuth: true, 
            message: 'Authentication required' 
          };
        }
        
        // Verify credentials
        try {
          // $fetch returns the data directly, not wrapped in a data property
          const authResult = await $fetch(`/api/users/auth`, {
            method: 'POST',
            body: {
              userId: id,
              ...authData
            }
          });
          
          console.log('Authentication result:', authResult);
          
          if (!authResult || !authResult.success) {
            return { 
              success: false, 
              message: authResult?.message || 'Authentication failed' 
            };
          }
        } catch (error) {
          console.error('Authentication error:', error);
          return {
            success: false,
            message: error.message || 'Authentication failed'
          };
        }
      }
      
      // Set user in state
      setUser(user);
      
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: error.message };
    }
  };

  const logout = () => {
    userId.value = null;
    userName.value = '';
    userAvatar.value = '';
    isAuthenticated.value = false;
    useAuth.value = false;
    isAdmin.value = false;
    localStorage.removeItem('userId');
    
    router.push('/');
  };

  const checkAuth = async () => {
    if (process.client) {
      const storedUserId = localStorage.getItem('userId');
      
      if (storedUserId) {
        try {
          // Try to fetch the user details directly without auth requirement
          console.log('Restoring session for user ID:', storedUserId);
          
          // Use a try/catch to handle potential network errors gracefully
          try {
            const user = await $fetch(`/api/users/${storedUserId}`);
            
            if (user) {
              console.log('User found, restoring session:', user);
              // Directly set the user without re-authentication
              setUser(user);
              return { success: true };
            }
          } catch (error) {
            console.error('Error restoring user session:', error);
            localStorage.removeItem('userId');
            return { success: false, message: 'Session expired' };
          }
        } catch (error) {
          console.error('Auth check error:', error);
          localStorage.removeItem('userId');
        }
      }
    }
    
    return { success: false };
  };

  const updateUserSettings = async (settings) => {
    if (!userId.value) return { success: false, message: 'Not logged in' };

    try {
      console.log('Updating user settings:', settings);
      
      // Make sure ID is included
      if (!settings.id) {
        settings.id = userId.value;
      }
      
      // Use $fetch directly instead of useFetch
      const updatedUser = await $fetch('/api/users', {
        method: 'PUT',
        body: settings
      });

      if (updatedUser && updatedUser.id) {
        // Update local state with new user info
        console.log('User updated successfully:', updatedUser);
        userName.value = updatedUser.name;
        userAvatar.value = updatedUser.avatar;
        useAuth.value = updatedUser.use_auth === 1;
        isAdmin.value = updatedUser.isAdmin === 1;
        
        return { success: true, user: updatedUser };
      }
      
      return { success: false, message: 'Failed to update user' };
    } catch (error) {
      console.error('Error updating user:', error);
      return { success: false, message: error.message };
    }
  };

  const deleteAccount = async () => {
    if (!userId.value) return { success: false, message: 'Not logged in' };

    try {
      console.log('Deleting account for user:', userId.value);
      
      // $fetch returns the data directly, not wrapped in a data property
      const response = await $fetch('/api/users/delete', {
        method: 'POST',
        body: { userId: userId.value }
      });
      
      console.log('Delete account response:', response);
      
      if (response && response.success) {
        logout();
        return { success: true };
      }
      
      return { success: false, message: response?.message || 'Failed to delete account' };
    } catch (error) {
      console.error('Error deleting account:', error);
      return { success: false, message: error.message || 'Failed to delete account' };
    }
  };

  return {
    userId,
    userName,
    userAvatar,
    isAuthenticated,
    useAuth,
    isAdmin,
    user,
    setUser,
    login,
    logout,
    checkAuth,
    updateUserSettings,
    deleteAccount
  };
};
