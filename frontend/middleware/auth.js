export default defineNuxtRouteMiddleware((to, from) => {
  // Skip middleware for login page
  if (to.path === '/') {
    return;
  }

  // Use the useSession composable to check authentication status
  const { isAuthenticated } = useSession();
  
  // If no user is logged in, redirect to homepage
  if (!isAuthenticated.value) {
    console.log('User not authenticated, redirecting to home page');
    return navigateTo('/');
  }
});
