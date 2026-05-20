type AvatarListener = (payload: { userId: string; avatarUrl: string | null }) => void;

const listeners = new Set<AvatarListener>();

export const publishAvatarUpdate = (userId: string, avatarUrl: string | null) => {
  listeners.forEach((listener) => {
    try {
      listener({ userId, avatarUrl });
    } catch {
      // Ignore listener failures so avatar updates still propagate elsewhere.
    }
  });
};

export const subscribeAvatarUpdates = (listener: AvatarListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
