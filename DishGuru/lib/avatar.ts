import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUser, supabase } from './supabase';

const AVATAR_CACHE_PREFIX = 'userAvatarUrl:';

export const normalizeAvatarUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const normalizedRaw = raw.trim();
  if (!normalizedRaw) return null;
  if (normalizedRaw.includes('/storage/v1/object/public/')) {
    const parts = normalizedRaw.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const tail = parts[1];
      const segments = tail.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      return data?.publicUrl ?? normalizedRaw;
    }
  }
  return normalizedRaw;
};

const getAvatarCacheKey = (userId: string | null | undefined) => {
  if (!userId) return null;
  return `${AVATAR_CACHE_PREFIX}${userId}`;
};

export const loadCachedAvatar = async (userId: string | null | undefined): Promise<string | null> => {
  try {
    const key = getAvatarCacheKey(userId);
    if (!key) return null;
    const raw = await AsyncStorage.getItem(key);
    return normalizeAvatarUrl(raw);
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

export const clearCachedAvatar = async (userId: string | null | undefined) => {
  const key = getAvatarCacheKey(userId);
  if (!key) return;
  await AsyncStorage.removeItem(key);
};

export const fetchAvatarFromProfile = async (userId: string | null | undefined): Promise<string | null> => {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('AppUsers')
    .select('avatar_url')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return normalizeAvatarUrl((row as { avatar_url?: string | null } | null)?.avatar_url ?? null);
};

export const resolveAvatarForUser = async (
  userId: string | null | undefined,
  authAvatarUrl?: string | null | undefined
): Promise<string | null> => {
  const profileAvatar = await fetchAvatarFromProfile(userId);
  if (profileAvatar) return profileAvatar;
  return normalizeAvatarUrl(authAvatarUrl ?? null);
};

export const fetchAvatarFromAuth = async (): Promise<string | null> => {
  const authUser = await getCurrentAuthUser();
  const userId = authUser?.id ?? null;
  const resolvedAvatar = await resolveAvatarForUser(
    userId,
    (authUser?.user_metadata as any)?.avatar_url ?? null
  );
  if (resolvedAvatar) return resolvedAvatar;
  return null;
};

export const hydrateAvatarForUser = async (
  userId: string | null | undefined,
  authAvatarUrl?: string | null | undefined
): Promise<string | null> => {
  const cachedAvatar = await loadCachedAvatar(userId);

  const resolvedAvatar = await resolveAvatarForUser(userId, authAvatarUrl);
  if (resolvedAvatar) {
    if (resolvedAvatar !== cachedAvatar) {
      await cacheAvatar(userId, resolvedAvatar);
    }
    return resolvedAvatar;
  }
  return cachedAvatar;
};
