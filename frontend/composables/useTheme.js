import { useSession } from './useSession';

// Module-level once-guard: useTheme() runs in app.vue (which lives for the
// whole SPA session) and in every ThemeToggle mount — the system-theme
// listener must only ever be attached once.
let systemThemeListenerAttached = false;

export const useTheme = () => {
  // Theme state
  const isDark = useState('dark-mode', () => true); // Default to dark mode
  const { userId } = useSession(); // Get user ID from our session composable

  // Apply theme to document
  const applyTheme = () => {
    if (import.meta.client) {
      if (isDark.value) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  // Fetch the logged-in user's saved theme preference from the server and
  // apply it. No-op (keeps current theme) on error.
  const fetchThemePreference = async () => {
    try {
      // Server reads the user from the session cookie.
      const data = await $fetch('/api/users/theme');
      if (data && !data.error) {
        isDark.value = data.theme === 'dark';
        applyTheme();
      }
    } catch (error) {
      console.error('Error fetching theme preference:', error);
    }
  };

  // Initialize theme on client-side
  onMounted(async () => {
    if (import.meta.client) {
      if (userId.value) {
        // Try to get user's saved preference from the server
        await fetchThemePreference();
      } else {
        // No logged in user, check localStorage. Only override the default
        // dark theme if there is an explicit preference.
        const userTheme = localStorage.getItem('theme');
        if (userTheme) {
          isDark.value = userTheme === 'dark';
        }
        applyTheme();
      }

      // Watch for system theme changes (attached once per app lifetime)
      if (!systemThemeListenerAttached) {
        systemThemeListenerAttached = true;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          // Only change if user hasn't set a preference
          if (!localStorage.getItem('theme') && !userId.value) {
            isDark.value = e.matches;
            applyTheme();
          }
        });
      }
    }
  });

  // Keep the document class in sync with the known state immediately, so a
  // component calling useTheme() never force-flashes dark over a light theme.
  if (import.meta.client) {
    applyTheme();
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
          body: { theme: isDark.value ? 'dark' : 'light' }
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
    if (newUserId && import.meta.client) {
      // User logged in, fetch their theme preference
      await fetchThemePreference();
    }
  });

  return {
    isDark,
    toggleTheme
  };
};
