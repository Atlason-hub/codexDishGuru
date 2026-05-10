type HomeTabKey = 'dishes' | 'restaurants';

type Listener = (tab: HomeTabKey) => void;

const listeners = new Set<Listener>();

export function subscribeHomeTab(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishHomeTab(tab: HomeTabKey) {
  listeners.forEach((listener) => {
    try {
      listener(tab);
    } catch {
      // Ignore listener failures so one bad subscriber doesn't break tab sync.
    }
  });
}

export type { HomeTabKey };
