// Auth plugin
export default defineNuxtPlugin(async () => {
  const { checkAuth } = useSession();

  // Check for existing user session
  await checkAuth();
});
