// Auth plugin
export default defineNuxtPlugin(async (nuxtApp) => {
  const { checkAuth } = useSession();
  
  // Check for existing user session
  const authResult = await checkAuth();
  
  console.log('Auth plugin initialized. Auth result:', authResult);
});
