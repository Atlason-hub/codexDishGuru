import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

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

let guestFeedSnapshotPromise: Promise<GuestFeedSnapshot | null> | null = null;

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
        console.info('[guest-feed] api snapshot loaded', {
          url: GUEST_FEED_URL,
          dishes: payload?.dishes?.length ?? 0,
          hasContext: Boolean(payload?.context),
          source: payload?.source ?? null,
        });
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

export const fetchCompanyIdForUser = async (userId: string) => {
  const { data: profile, error: profileError } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError) return null;
  return profile?.company_id ?? null;
};

export const fetchOrderVendorForUser = async (userId: string) => {
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
  return company?.order_vendor ?? null;
};

export const fetchGlobalCompanyContext = async () => {
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
      if (companyContext) return companyContext;
    }
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    return snapshot?.context ?? null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', globalRow.user_id)
    .maybeSingle();

  if (profileError) {
    console.warn('[guest-feed] global context profile lookup failed', profileError.message);
  }

  if (!profile?.company_id) {
    if (GUEST_COMPANY_ID) {
      const companyContext = await fetchPublicCompanyContextById(GUEST_COMPANY_ID, globalRow.user_id);
      if (companyContext) return companyContext;
    }
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    return snapshot?.context ?? null;
  }

  const companyContext = await fetchPublicCompanyContextById(profile.company_id, globalRow.user_id);
  if (!companyContext) {
    const snapshot = await fetchGuestFeedSnapshotFromApi();
    return snapshot?.context ?? null;
  }

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
    console.info('[guest-feed] loaded global dishes directly', {
      count: globalData.length,
    });
    return globalData as any[];
  }

  const snapshot = await fetchGuestFeedSnapshotFromApi();
  if (Array.isArray(snapshot?.dishes) && snapshot.dishes.length > 0) {
    console.info('[guest-feed] using api guest dishes fallback', {
      count: snapshot.dishes.length,
      source: snapshot.source ?? null,
    });
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
  console.info('[guest-feed] loaded guest dishes by fallback user id', {
    count: (fallbackData as any[])?.length ?? 0,
    userId: globalContext.userId,
  });
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

  const { data: companyData, error: companyError } = await supabase.rpc('get_company_dishes', {
    company_id: companyId,
  });

  if (companyError) throw companyError;
  return (companyData as any[]) ?? [];
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
      if (row?.user_id && row?.avatar_url) {
        avatars[String(row.user_id)] = String(row.avatar_url);
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
    if (row?.user_id && row?.avatar_url) {
      avatars[String(row.user_id)] = String(row.avatar_url);
    }
  });
  return { avatars, labels: {} };
};

export const loadCachedRestaurantMenu = async <T>(restaurantId: number) => {
  try {
    const raw = await AsyncStorage.getItem(`${RESTAURANT_MENU_CACHE_PREFIX}${restaurantId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; data?: T };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > RESTAURANT_MENU_TTL_MS) {
      await AsyncStorage.removeItem(`${RESTAURANT_MENU_CACHE_PREFIX}${restaurantId}`);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
};

export const saveCachedRestaurantMenu = async <T>(restaurantId: number, data: T) => {
  try {
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
