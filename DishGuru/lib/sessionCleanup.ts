import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearCachedAvatar } from './avatar';
import { clearUserScopedCaches } from './appData';
import {
  clearPersistedLogoForIdentity,
  clearSessionCompanyLogo,
} from './logo';

const HOME_FEED_CACHE_PREFIX = 'home_dishes_cache:v2:';

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
