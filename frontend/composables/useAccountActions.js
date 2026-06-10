// useAccountActions — shared account / rescan machinery for the two course
// pages: the header user object, the delete-account flow, the rescan POST
// and the visibility refs for the user-menu modals.
import { ref, computed } from 'vue';
import { useSession } from './useSession';

export function useAccountActions() {
  const { deleteAccount: userDelete, userId, userName, userAvatar, isAdmin, isActive } = useSession();

  // Computed user object with the structure the header components expect.
  // Must include id so the My Profile (UserManagement) modal knows which
  // user to load and patch.
  const userObject = computed(() => {
    return {
      id: userId.value,
      name: userName.value,
      avatar: userAvatar.value,
      isAdmin: isAdmin.value ? 1 : 0,
      is_active: isActive.value ? 1 : 0
    };
  });

  const showUserManagement = ref(false);
  const showAdminPanel = ref(false);
  const showDeleteConfirm = ref(false);
  const isDeleting = ref(false);
  const showRescanConfirm = ref(false);
  const preserveMetadata = ref(true);

  async function deleteAccount() {
    showDeleteConfirm.value = false;
    isDeleting.value = true;
    try {
      const result = await userDelete();
      if (!result?.success) {
        console.error('Failed to delete account:', result?.message);
        alert(`Failed to delete account: ${result?.message || 'Unknown error'}`);
      }
      // On success the useSession composable already logs out and redirects.
    } catch (err) {
      console.error('Error deleting account:', err);
      alert('An error occurred while trying to delete your account.');
    } finally {
      isDeleting.value = false;
    }
  }

  // POSTs the rescan request. Returns true when the server accepted it so
  // callers can chain page-specific follow-up (e.g. scan-status polling).
  async function confirmRescan() {
    showRescanConfirm.value = false;
    try {
      const response = await $fetch('/api/courses/rescan', {
        method: 'POST',
        body: { preserveMetadata: preserveMetadata.value }
      });
      if (!response?.success) {
        console.error('Failed to start rescan:', response?.error || 'Unknown error');
        alert(`Failed to start database rescan: ${response?.error || 'Unknown error'}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error initiating rescan:', err);
      alert(`Error initiating database rescan: ${err.message || 'Unknown error'}`);
      return false;
    }
  }

  return {
    userObject,
    showUserManagement,
    showAdminPanel,
    showDeleteConfirm,
    isDeleting,
    showRescanConfirm,
    preserveMetadata,
    deleteAccount,
    confirmRescan
  };
}
