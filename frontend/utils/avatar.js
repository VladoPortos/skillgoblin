// Helper functions for avatar handling
export const isValidAvatarJson = (avatarString) => {
  if (!avatarString) return false;
  try {
    JSON.parse(avatarString);
    return true;
  } catch (e) {
    return false;
  }
};

export const parseAvatar = (avatarString) => {
  try {
    return JSON.parse(avatarString);
  } catch (e) {
    return {};
  }
};
