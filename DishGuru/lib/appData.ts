import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentAuthUser, supabase } from './supabase';
import { normalizeAvatarUrl } from './avatar';

const RESTAURANT_MENU_CACHE_PREFIX = 'restaurant_menu_cache:v1:';
const RESTAURANT_MENU_TTL_MS = 15 * 60 * 1000;
const GUEST_FEED_API_BASE = process.env.EXPO_PUBLIC_GUEST_API_BASE_URL?.replace(/\/+$/, '') ?? '';
const GUEST_FEED_URL =
  process.env.EXPO_PUBLIC_GUEST_FEED_URL?.trim() ||
  (GUEST_FEED_API_BASE ? `${GUEST_FEED_API_BASE}/api/guest-feed` : '');
const GUEST_COMPANY_ID = process.env.EXPO_PUBLIC_GUEST_COMPANY_ID?.trim() ?? '';

type GuestCompanyContext = {
  userId: string;
  companyId: string;
  cityId: number | null;
  streetId: number | null;
  logoUrl: string | null;
  orderVendor: string | null;
};

type GuestFeedSnapshot = {
  dishes: any[];
  context: GuestCompanyContext | null;
  source?: string;
};

export type DishAssociationDraft = {
  id: string;
  user_id: string | null;
  image_url: string | null;
  image_path: string | null;
  restaurant_id: number | null;
  restaurant_name: string | null;
  dish_id: number | null;
  dish_name: string | null;
  review_text: string | null;
  tasty_score: number | null;
  filling_score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

let guestFeedSnapshotPromise: Promise<GuestFeedSnapshot | null> | null = null;
const SIMPLE_CACHE_TTL_MS = 60 * 1000;

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const companyIdCache = new Map<string, TimedCacheEntry<string | null>>();
const orderVendorCache = new Map<string, TimedCacheEntry<string | null>>();
const companyUserIdsCache = new Map<string, TimedCacheEntry<string[]>>();
let globalCompanyContextCache: TimedCacheEntry<GuestCompanyContext | null> | null = null;
const restaurantMenuMemoryCache = new Map<
  number,
  { savedAt: number; data: unknown }
>();

export const primeCompanyIdForUser = (userId: string, companyId: string | null) => {
  companyIdCache.set(userId, writeTimedCache(companyId));
};

export const clearUserScopedCaches = (userId: string) => {
  companyIdCache.delete(userId);
  orderVendorCache.delete(userId);
};

const readTimedCache = <T>(entry: TimedCacheEntry<T> | null | undefined) => {
  if (!entry) return { hit: false as const, value: null as T | null };
  if (Date.now() > entry.expiresAt) {
    return { hit: false as const, value: null as T | null };
  }
  return { hit: true as const, value: entry.value };
};

const writeTimedCache = <T>(value: T): TimedCacheEntry<T> => ({
  value,
  expiresAt: Date.now() + SIMPLE_CACHE_TTL_MS,
});

const fetchPublicCompanyContextById = async (companyId: string, userId: string | null) => {
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, city_id, street_id, logo_url, order_vendor')
    .eq('id', companyId)
    .maybeSingle();

  if (companyError) {
    console.warn('[guest-feed] public company lookup failed', companyError.message);
    return null;
  }

  if (!company) {
    return null;
  }

  return {
    userId: userId ?? '',
    companyId: company.id as string,
    cityId: (company as any).city_id ?? null,
    streetId: (company as any).street_id ?? null,
    logoUrl: (company as any).logo_url ?? null,
    orderVendor: (company as any).order_vendor ?? null,
  };
};

const fetchGuestFeedSnapshotFromApi = async () => {
  if (!GUEST_FEED_URL) {
    return null;
  }

  if (!guestFeedSnapshotPromise) {
    guestFeedSnapshotPromise = (async () => {
      try {
        const response = await fetch(GUEST_FEED_URL, {
          headers: {
            Accept: 'application/json',
          },
        });
        if (!response.ok) {
          const body = await response.text();
          console.warn('[guest-feed] api request failed', {
            status: response.status,
            body,
            url: GUEST_FEED_URL,
          });
          return null;
        }
        const payload = (await response.json()) as GuestFeedSnapshot | null;
        return payload;
      } catch (error) {
        console.warn('[guest-feed] api request threw', {
          url: GUEST_FEED_URL,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })().finally(() => {
      guestFeedSnapshotPromise = null;
    });
  }

  return guestFeedSnapshotPromise;
};

export const fetchFavoritesMap = async (userId: string) => {
  const { data, error } = await supabase
    .from('dish_favorites')
    .select('dish_association_id')
    .eq('user_id', userId);
  if (error) throw error;
  const map: Record<string, boolean> = {};
  (data ?? []).forEach((row: any) => {
    if (row?.dish_association_id) map[String(row.dish_association_id)] = true;
  });
  return map;
};

export const fetchDishDrafts = async (userId: string) => {
  const { data, error } = await supabase
    .from('dish_association_drafts')
    .select(
      'id, user_id, image_url, image_path, restaurant_id, restaurant_name, dish_id, dish_name, review_text, tasty_score, filling_score, created_at, updated_at'
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data as DishAssociationDraft[]) ?? [];
};

export const fetchDishDraftCount = async (userId: string) => {
  const { count, error } = await supabase
    .from('dish_association_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  return count ?? 0;
};

export const fetchDishDraftById = async (draftId: string, userId: string) => {
  const { data, error } = await supabase
    .from('dish_association_drafts')
    .select(
      'id, user_id, image_url, image_path, restaurant_id, restaurant_name, dish_id, dish_name, review_text, tasty_score, filling_score, created_at, updated_at'
    )
    .eq('id', draftId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as DishAssociationDraft | null) ?? null;
};

export const saveDishDraft = async (
  payload: Omit<DishAssociationDraft, 'id' | 'created_at' | 'updated_at'>
) => {
  const { data, error } = await supabase
    .from('dish_association_drafts')
    .insert(payload)
    .select(
      'id, user_id, image_url, image_path, restaurant_id, restaurant_name, dish_id, dish_name, review_text, tasty_score, filling_score, created_at, updated_at'
    )
    .single();

  if (error) throw error;
  return data as DishAssociationDraft;
};

export const updateDishDraft = async (
  draftId: string,
  userId: string,
  payload: Partial<Omit<DishAssociationDraft, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
) => {
  const { data, error } = await supabase
    .from('dish_association_drafts')
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('user_id', userId)
    .select(
      'id, user_id, image_url, image_path, restaurant_id, restaurant_name, dish_id, dish_name, review_text, tasty_score, filling_score, created_at, updated_at'
    )
    .single();

  if (error) throw error;
  return data as DishAssociationDraft;
};

export const deleteDishDraft = async (draftId: string, userId: string) => {
  const { error } = await supabase
    .from('dish_association_drafts')
    .delete()
    .eq('id', draftId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const fetchCompanyIdForUser = async (userId: string) => {
  const cached = readTimedCache(companyIdCache.get(userId));
  if (cached.hit) {
    return cached.value;
  }
  const { data: preferredProfile, error: preferredProfileError } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .not('company_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (preferredProfileError) return null;
  let companyId = preferredProfile?.company_id ?? null;
  if (!companyId) {
    const { data: profile, error: profileError } = await supabase
      .from('AppUsers')
      .select('company_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (profileError) return null;
    companyId = profile?.company_id ?? null;
  }
  if (!companyId) {
    try {
      const authUser = await getCurrentAuthUser();
      const authEmail =
        authUser?.id === userId ? authUser.email?.trim().toLowerCase() ?? '' : '';
      const domain = authEmail.includes('@') ? authEmail.split('@').pop()?.trim().toLowerCase() ?? '' : '';
      if (domain) {
        const { data: companyByDomain, error: companyByDomainError } = await supabase
          .from('companies')
          .select('id')
          .ilike('domain', domain)
          .limit(1)
          .maybeSingle();
        if (!companyByDomainError) {
          companyId = companyByDomain?.id ?? null;
        }
      }
    } catch {}
  }
  companyIdCache.set(userId, writeTimedCache(companyId));
  return companyId;
};

export const fetchOrderVendorForUser = async (userId: string) => {
  const cached = readTimedCache(orderVendorCache.get(userId));
  if (cached.hit) {
    return cached.value;
  }
  const companyId = await fetchCompanyIdForUser(userId);
  if (!companyId) {
    return null;
  }
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('order_vendor')
    .eq('id', companyId)
    .maybeSingle();
  if (companyError) {
    return null;
  }
  const orderVendor = company?.order_vendor ?? null;
  orderVendorCache.set(userId, writeTimedCache(orderVendor));
  return orderVendor;
};

export const fetchGlobalCompanyContext = async () => {
  const cached = readTimedCache(globalCompanyContextCache);
  if (cached.hit) {
    return cached.value;
  }

  const { data: globalRow, error: globalError } = await supabase
    .from('dish_associations')
    .select('user_id')
    .eq('visibility_scope', 'global')
    .not('user_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (globalError) {
    console.warn('[guest-feed] global context dish lookup failed', globalError.message);
  }

  if (!globalRow?.user_id) {
    if (GUEST_COMPANY_ID) {
      const companyContext = await fetchPublicCompanyContextById(GUEST_COMPANY_ID, null);
      if (companyContext) {
        globalCompanyContextCache = writeTimedCache(companyContext);
        return companyContext;
      }
    }
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    const context = snapshot?.context ?? null;
    globalCompanyContextCache = writeTimedCache(context);
    return context;
  }

  const { data: profile, error: profileError } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', globalRow.user_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileError) {
    console.warn('[guest-feed] global context profile lookup failed', profileError.message);
  }

  if (!profile?.company_id) {
    if (GUEST_COMPANY_ID) {
      const companyContext = await fetchPublicCompanyContextById(GUEST_COMPANY_ID, globalRow.user_id);
      if (companyContext) {
        globalCompanyContextCache = writeTimedCache(companyContext);
        return companyContext;
      }
    }
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    const context = snapshot?.context ?? null;
    globalCompanyContextCache = writeTimedCache(context);
    return context;
  }

  const companyContext = await fetchPublicCompanyContextById(profile.company_id, globalRow.user_id);
  if (!companyContext) {
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    const context = snapshot?.context ?? null;
    globalCompanyContextCache = writeTimedCache(context);
    return context;
  }

  globalCompanyContextCache = writeTimedCache(companyContext);
  return companyContext;
};

export const fetchGlobalDishes = async () => {
  const { data: globalData, error: globalError } = await supabase
    .from('dish_associations')
    .select(
      'id, user_id, dish_id, image_url, image_path, dish_name, restaurant_name, restaurant_id, tasty_score, filling_score, created_at, review_text'
    )
    .eq('visibility_scope', 'global')
    .order('created_at', { ascending: false });

  if (globalError) {
    console.warn('[guest-feed] direct global dishes lookup failed', globalError.message);
  }
  if (Array.isArray(globalData) && globalData.length > 0) {
    return globalData as any[];
  }

  const snapshot = await fetchGuestFeedSnapshotFromApi();
  if (Array.isArray(snapshot?.dishes) && snapshot.dishes.length > 0) {
    return snapshot.dishes;
  }

  const globalContext = await fetchGlobalCompanyContext();
  if (!globalContext?.userId) {
    console.warn('[guest-feed] no global guest context was resolved');
    return [];
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('dish_associations')
    .select(
      'id, user_id, dish_id, image_url, image_path, dish_name, restaurant_name, restaurant_id, tasty_score, filling_score, created_at, review_text'
    )
    .eq('user_id', globalContext.userId)
    .order('created_at', { ascending: false });

  if (fallbackError) {
    console.warn('[guest-feed] fallback user dishes lookup failed', fallbackError.message);
    throw fallbackError;
  }
  return (fallbackData as any[]) ?? [];
};

export const fetchVisibleDishes = async (companyId: string | number | null) => {
  if (!companyId) return [];

  const { data: visibleData, error: visibleError } = await supabase.rpc('get_visible_dishes', {
    p_company_id: companyId,
  });

  if (!visibleError && Array.isArray(visibleData)) {
    return visibleData as any[];
  }

  return fetchCompanyDishes(companyId);
};

export const fetchCompanyDishes = async (companyId: string | number | null) => {
  if (!companyId) return [];

  const { data: companyData, error: companyError } = await supabase.rpc('get_company_dishes', {
    company_id: companyId,
  });

  if (companyError) throw companyError;
  return (companyData as any[]) ?? [];
};

export const fetchCompanyUserIds = async (
  companyId: string | number | null,
  emailDomain?: string | null
) => {
  const cacheKey = `${companyId ?? ''}::${emailDomain?.trim().toLowerCase() ?? ''}`;
  const cached = readTimedCache(companyUserIdsCache.get(cacheKey));
  if (cached.hit) {
    return cached.value;
  }
  const scopedUserIds = new Set<string>();

  if (companyId) {
    const { data: companyUsers, error: usersError } = await supabase
      .from('AppUsers')
      .select('user_id')
      .eq('company_id', companyId);

    if (usersError) {
      throw usersError;
    }

    (companyUsers ?? []).forEach((row: any) => {
      if (row?.user_id) scopedUserIds.add(String(row.user_id));
    });
  }

  if (emailDomain) {
    const normalizedDomain = emailDomain.trim().toLowerCase();
    if (normalizedDomain) {
      const { data: domainUsers, error: domainUsersError } = await supabase
        .from('AppUsers')
        .select('user_id')
        .ilike('email', `%@${normalizedDomain}`);

      if (domainUsersError) {
        throw domainUsersError;
      }

      (domainUsers ?? []).forEach((row: any) => {
        if (row?.user_id) scopedUserIds.add(String(row.user_id));
      });
    }
  }

  const userIds = [...scopedUserIds];
  companyUserIdsCache.set(cacheKey, writeTimedCache(userIds));
  return userIds;
};

const sortRowsByCreatedAtDesc = <T extends { created_at?: string | null }>(rows: T[]) => {
  return [...rows].sort((a, b) => {
    const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
};

export const mergeCompanyVisibleRows = <
  T extends { id?: string | number | null; user_id?: string | null; created_at?: string | null }
>(
  visibleRows: T[],
  companyRows: T[],
  companyUserIds: string[],
  globalUserId?: string | null
) => {
  const merged = new Map<string, T>();
  visibleRows.forEach((row) => {
    if (row?.id != null) merged.set(String(row.id), row);
  });
  companyRows.forEach((row) => {
    if (row?.id != null) merged.set(String(row.id), row);
  });

  const mergedRows = [...merged.values()];
  const nonGlobalRows =
    globalUserId
      ? mergedRows.filter((row) => !row?.user_id || String(row.user_id) !== String(globalUserId))
      : mergedRows;

  if (globalUserId && nonGlobalRows.length >= 3) {
    return sortRowsByCreatedAtDesc(nonGlobalRows);
  }

  return sortRowsByCreatedAtDesc(mergedRows);
};

export const fetchUserAvatarMaps = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return { avatars: {}, labels: {} } as {
      avatars: Record<string, string>;
      labels: Record<string, string>;
    };
  }

  const { data: profileData, error: profileError } = await supabase.rpc('get_user_profiles', {
    user_ids: userIds,
  });

  if (!profileError && Array.isArray(profileData)) {
    const avatars: Record<string, string> = {};
    const labels: Record<string, string> = {};
    (profileData ?? []).forEach((row: any) => {
      const normalizedAvatar = normalizeAvatarUrl(row?.avatar_url);
      if (row?.user_id && normalizedAvatar) {
        avatars[String(row.user_id)] = normalizedAvatar;
      }
      if (row?.user_id && row?.email_prefix) {
        labels[String(row.user_id)] = String(row.email_prefix);
      }
    });
    return { avatars, labels };
  }

  const { data, error: avatarError } = await supabase
    .from('AppUsers')
    .select('user_id, avatar_url')
    .in('user_id', userIds);

  if (avatarError) {
    return { avatars: {}, labels: {} };
  }

  const avatars: Record<string, string> = {};
  (data ?? []).forEach((row: any) => {
    const normalizedAvatar = normalizeAvatarUrl(row?.avatar_url);
    if (row?.user_id && normalizedAvatar) {
      avatars[String(row.user_id)] = normalizedAvatar;
    }
  });
  return { avatars, labels: {} };
};

export const loadCachedRestaurantMenu = async <T>(restaurantId: number) => {
  try {
    const memoryEntry = restaurantMenuMemoryCache.get(restaurantId);
    if (memoryEntry) {
      if (Date.now() - memoryEntry.savedAt <= RESTAURANT_MENU_TTL_MS) {
        return (memoryEntry.data as T) ?? null;
      }
      restaurantMenuMemoryCache.delete(restaurantId);
    }
    const raw = await AsyncStorage.getItem(`${RESTAURANT_MENU_CACHE_PREFIX}${restaurantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > RESTAURANT_MENU_TTL_MS) {
      await AsyncStorage.removeItem(`${RESTAURANT_MENU_CACHE_PREFIX}${restaurantId}`);
      restaurantMenuMemoryCache.delete(restaurantId);
      return null;
    }
    restaurantMenuMemoryCache.set(restaurantId, {
      savedAt: parsed.savedAt,
      data: parsed.data,
    });
    return parsed.data ?? null;
  } catch {
    return null;
  }
};

export const saveCachedRestaurantMenu = async <T>(restaurantId: number, data: T) => {
  try {
    restaurantMenuMemoryCache.set(restaurantId, {
      savedAt: Date.now(),
      data,
    });
    await AsyncStorage.setItem(
      `${RESTAURANT_MENU_CACHE_PREFIX}${restaurantId}`,
      JSON.stringify({
        savedAt: Date.now(),
        data,
      })
    );
  } catch {
    // Ignore cache write failures and let the live fetch drive the UI.
  }
};
