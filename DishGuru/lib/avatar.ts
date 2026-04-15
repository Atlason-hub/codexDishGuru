import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const AVATAR_CACHE_PREFIX = 'userAvatarUrl:';

const getAvatarCacheKey = (userId: string | null | undefined) => {
  if (!userId) return null;
  return `${AVATAR_CACHE_PREFIX}${userId}`;
};

export const loadCachedAvatar = async (userId: string | null | undefined): Promise<string | null> => {
  try {
    const key = getAvatarCacheKey(userId);
    if (!key) return null;
    const raw = await AsyncStorage.getItem(key);
    return raw ?? null;
  } catch {
    return null;
  }
};

export const cacheAvatar = async (userId: string | null | undefined, url: string | null) => {
  const key = getAvatarCacheKey(userId);
  if (!key) return;
  if (!url) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, url);
};

export const fetchAvatarFromAuth = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return (data.user?.user_metadata as any)?.avatar_url ?? null;
};
