import { useSession } from './useSession';

export const useTheme = () => {
  // Theme state
  const isDark = useState('dark-mode', () => true); // Default to dark mode
  const { userId } = useSession(); // Get user ID from our session composable
  
  // Initialize theme on client-side
  onMounted(async () => {
    if (process.client) {
      // Default to dark mode always
      let shouldUseDark = true;
      
      // Try to get user's saved preference from the server if they're logged in
      if (userId.value) {
        try {
          // Use $fetch instead of useFetch for mounted hooks
          const data = await $fetch(`/api/users/theme?userId=${userId.value}`);
          if (data && !data.error) {
            shouldUseDark = data.theme === 'dark';
          }
        } catch (error) {
          console.error('Error fetching theme preference:', error);
          // Fall back to localStorage or default dark
        }
      } else {
        // No logged in user, check localStorage
        const userTheme = localStorage.getItem('theme');
        // Only override the default dark theme if there is an explicit preference
        if (userTheme) {
          shouldUseDark = userTheme === 'dark';
        }
        // Otherwise keep the default dark theme (shouldUseDark is already true)
      }
      
      // Set the theme
      isDark.value = shouldUseDark;
      
      // Apply theme immediately
      applyTheme();
      
      // Watch for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        // Only change if user hasn't set a preference
        if (!localStorage.getItem('theme') && !userId.value) {
          isDark.value = e.matches;
          applyTheme();
        }
      });
    }
  });
  
  // Apply theme to document
  const applyTheme = () => {
    if (process.client) {
      if (isDark.value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };
  
  // Apply theme to document immediately on import
  if (process.client) {
    // Default to dark mode for initial page load before Vue hydration
    document.documentElement.classList.add('dark');
  }
  
  // Toggle theme
  const toggleTheme = async () => {
    isDark.value = !isDark.value;
    
    // Save to localStorage for guests
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
    
    // If user is logged in, save to database
    if (userId.value) {
      try {
        await $fetch('/api/users/theme', {
          method: 'POST',
          body: {
            userId: userId.value,
            theme: isDark.value ? 'dark' : 'light'
          }
        });
      } catch (error) {
        console.error('Error saving theme preference:', error);
      }
    }
    
    // Apply changes
    applyTheme();
  };
  
  // Watch for state changes to apply theme
  watch(isDark, () => {
    applyTheme();
  });
  
  // Watch for login/logout to update theme
  watch(userId, async (newUserId) => {
    if (newUserId && process.client) {
      // User logged in, fetch their theme preference
      try {
        // Use $fetch instead of useFetch for consistency and to avoid the warning
        const data = await $fetch(`/api/users/theme?userId=${newUserId}`);
        if (data && !data.error) {
          isDark.value = data.theme === 'dark';
          applyTheme();
        }
      } catch (error) {
        console.error('Error fetching theme preference after login:', error);
      }
    }
  });
  
  return {
    isDark,
    toggleTheme
  };
};
