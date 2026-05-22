import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCachedAvatar } from './avatar';
import { clearUserScopedCaches } from './appData';
import {
  clearPersistedLogoForIdentity,
  clearSessionCompanyLogo,
} from './logo';

const HOME_FEED_CACHE_PREFIX = 'home_dishes_cache:v2:';
const APP_CACHE_PREFIXES = [
  'home_dishes_cache:v2:',
  'userAvatarUrl:',
  'companyLogoCache',
  'restaurant_menu_cache:v1:',
];
const APP_CACHE_KEYS = ['dishguru_guest_mode:v1'];

export const clearLocalAppCaches = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const removableKeys = keys.filter(
      (key) =>
        APP_CACHE_KEYS.includes(key) ||
        APP_CACHE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix))
    );
    if (removableKeys.length > 0) {
      await AsyncStorage.multiRemove(removableKeys);
    }
  } catch {
    // Ignore local cache cleanup failures and let per-key clears below recover.
  }
};

export const clearUserSessionArtifacts = async (userId: string | null, email: string | null) => {
  if (userId) {
    clearUserScopedCaches(userId);
    await AsyncStorage.removeItem(`${HOME_FEED_CACHE_PREFIX}${userId}`);
  }

  clearSessionCompanyLogo();

  await Promise.all([
    clearPersistedLogoForIdentity(userId, email),
    clearCachedAvatar(userId),
  ]);
};
