type Listener = (pending: boolean) => void;

let pendingLocalLogout = false;
const listeners = new Set<Listener>();

export const getPendingLocalLogout = () => pendingLocalLogout;

export const setPendingLocalLogout = (pending: boolean) => {
  pendingLocalLogout = pending;
  listeners.forEach((listener) => {
    try {
      listener(pending);
    } catch {
      // Ignore listener errors so logout flow is never blocked by observers.
    }
  });
};

export const subscribePendingLocalLogout = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
