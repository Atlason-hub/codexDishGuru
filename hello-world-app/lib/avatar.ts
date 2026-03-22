import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const AVATAR_CACHE_KEY = 'userAvatarUrl';

export const loadCachedAvatar = async (): Promise<string | null> => {
  try {
    const raw = await AsyncStorage.getItem(AVATAR_CACHE_KEY);
    return raw ?? null;
  } catch {
    return null;
  }
};

export const cacheAvatar = async (url: string | null) => {
  if (!url) {
    await AsyncStorage.removeItem(AVATAR_CACHE_KEY);
    return;
  }
  await AsyncStorage.setItem(AVATAR_CACHE_KEY, url);
};

export const fetchAvatarFromAuth = async (): Promise<string | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return (data.user?.user_metadata as any)?.avatar_url ?? null;
};
