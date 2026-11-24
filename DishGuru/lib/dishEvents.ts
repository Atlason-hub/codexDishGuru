import AsyncStorage from '@react-native-async-storage/async-storage';

type DishDeletedPayload = {
  dishId: string;
  userId: string;
};

type DishDeletedListener = (payload: DishDeletedPayload) => void;

const deletedListeners = new Set<DishDeletedListener>();

const getHomeCacheKey = (userId: string) => `home_dishes_cache:v2:${userId}`;

export const publishDishDeleted = (payload: DishDeletedPayload) => {
  deletedListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // A stale screen listener must not block deletion propagation.
    }
  });

  void (async () => {
    try {
      const key = getHomeCacheKey(payload.userId);
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { updatedAt?: number; items?: Array<{ id?: string }> };
      if (!Array.isArray(parsed.items)) return;
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          ...parsed,
          updatedAt: Date.now(),
          items: parsed.items.filter((item) => item.id !== payload.dishId),
        })
      );
    } catch {
      // A later network refresh can repair an unreadable cache.
    }
  })();
};

export const subscribeDishDeleted = (listener: DishDeletedListener) => {
  deletedListeners.add(listener);
  return () => {
    deletedListeners.delete(listener);
  };
};
