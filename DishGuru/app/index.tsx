import {
  Animated,
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AvatarPreviewModal from '../components/AvatarPreviewModal';
import AppHeader from '../components/AppHeader';
import HomeAuthView from '../components/HomeAuthView';
import HomeFeedHeader from '../components/HomeFeedHeader';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheScopedLogo,
  getEmailDomain,
  getLogoCacheScope,
  loadSessionCompanyLogo,
  loadCachedLogo,
  resolveLogoUrl,
} from '../lib/logo';
import { openVendorDish } from '../lib/orderVendor';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { buildAuthRedirectUrl } from '../lib/authRedirect';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar, resolveAvatarForUser } from '../lib/avatar';
import DishCard from '../components/DishCard';
import StaggeredEntrance from '../components/StaggeredEntrance';
import LegalModal from '../components/LegalModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import RestaurantsTab from '../components/RestaurantsTab';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearUserScopedCaches,
  fetchCompanyDishes,
  fetchCompanyIdForUser,
  fetchFavoritesMap,
  fetchGlobalCompanyContext,
  fetchGlobalDishes,
  mergeCompanyVisibleRows,
  primeCompanyIdForUser,
  fetchUserAvatarMaps,
  fetchVisibleDishes,
} from '../lib/appData';
import {
  getRenderableHomeAssociations,
  groupHomeAssociations,
  normalizeHomeSearchNeedle,
  type GroupedHomeAssociation,
} from '../lib/homeFeed';
import { showAppAlert, showAppDialog } from '../lib/appDialog';
import { getLegalUrl, useLocale } from '../lib/locale';
import { loadGuestMode, setGuestModeEnabled } from '../lib/guestMode';
import { publishHomeTab, subscribeHomeTab, type HomeTabKey } from '../lib/homeTabs';
import { subscribeAvatarUpdates } from '../lib/avatarEvents';
import { getPendingLocalLogout, setPendingLocalLogout, subscribePendingLocalLogout } from '../lib/logoutGate';
import { clearUserSessionArtifacts } from '../lib/sessionCleanup';

const primaryActionColor = '#C75D2C';
const HOME_FEED_FINAL_WAIT_MS = 2200;
const HOME_FEED_RPC_TIMEOUT_MS = 4000;
const HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS = 1500;
const BOOTSTRAP_SUPABASE_URL = 'https://pcamdhbgjbsnfwicyiqa.supabase.co';
const BOOTSTRAP_SUPABASE_ANON_KEY = 'sb_publishable_7JyR16-ZDFnkOPYMHZrczA_oE10ympy';

type DishAssociation = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  filling_score: number | null;
  image_path?: string | null;
  created_at: string | null;
  review_text?: string | null;
};

let rememberedHomeFeed: {
  userId: string | null;
  items: DishAssociation[];
} | null = null;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const buildBootstrapHeaders = (accessToken?: string | null) => ({
  apikey: BOOTSTRAP_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${accessToken || BOOTSTRAP_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

const fetchBootstrapCompanyIdByDomain = async (domain: string, accessToken?: string | null) => {
  const url =
    `${BOOTSTRAP_SUPABASE_URL}/rest/v1/companies?` +
    new URLSearchParams({
      select: 'id',
      domain: `ilike.${domain}`,
      limit: '1',
    }).toString();
  const response = await fetch(url, { headers: buildBootstrapHeaders(accessToken) });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id?: string | null }>;
  return rows[0]?.id ?? null;
};

const fetchBootstrapCompanyByDomain = async (domain: string, accessToken?: string | null) => {
  const url =
    `${BOOTSTRAP_SUPABASE_URL}/rest/v1/companies?` +
    new URLSearchParams({
      select: 'id,logo_url,order_vendor',
      domain: `ilike.${domain}`,
      limit: '1',
    }).toString();
  const response = await fetch(url, { headers: buildBootstrapHeaders(accessToken) });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    id?: string | null;
    logo_url?: string | null;
    order_vendor?: string | null;
  }>;
  return rows[0] ?? null;
};

const fetchBootstrapCompanyById = async (companyId: string, accessToken?: string | null) => {
  const url =
    `${BOOTSTRAP_SUPABASE_URL}/rest/v1/companies?` +
    new URLSearchParams({
      select: 'id,logo_url,order_vendor',
      id: `eq.${companyId}`,
      limit: '1',
    }).toString();
  const response = await fetch(url, { headers: buildBootstrapHeaders(accessToken) });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    id?: string | null;
    logo_url?: string | null;
    order_vendor?: string | null;
  }>;
  return rows[0] ?? null;
};

const fetchBootstrapVisibleRows = async (companyId: string, accessToken?: string | null) => {
  const response = await fetch(`${BOOTSTRAP_SUPABASE_URL}/rest/v1/rpc/get_visible_dishes`, {
    method: 'POST',
    headers: buildBootstrapHeaders(accessToken),
    body: JSON.stringify({ p_company_id: companyId }),
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};

const fetchBootstrapCompanyRows = async (companyId: string, accessToken?: string | null) => {
  const response = await fetch(`${BOOTSTRAP_SUPABASE_URL}/rest/v1/rpc/get_company_dishes`, {
    method: 'POST',
    headers: buildBootstrapHeaders(accessToken),
    body: JSON.stringify({ company_id: companyId }),
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};

const fetchBootstrapUserAvatarMaps = async (userIds: string[], accessToken?: string | null) => {
  if (userIds.length === 0) {
    return {
      avatars: {} as Record<string, string>,
      labels: {} as Record<string, string>,
    };
  }

  const response = await fetch(`${BOOTSTRAP_SUPABASE_URL}/rest/v1/rpc/get_user_profiles`, {
    method: 'POST',
    headers: buildBootstrapHeaders(accessToken),
    body: JSON.stringify({ user_ids: userIds }),
  });

  if (!response.ok) {
    return {
      avatars: {} as Record<string, string>,
      labels: {} as Record<string, string>,
    };
  }

  const rows = await response.json();
  const avatars: Record<string, string> = {};
  const labels: Record<string, string> = {};

  if (Array.isArray(rows)) {
    rows.forEach((row: any) => {
      if (row?.user_id && row?.avatar_url) {
        avatars[String(row.user_id)] = String(row.avatar_url);
      }
      if (row?.user_id && row?.email_prefix) {
        labels[String(row.user_id)] = String(row.email_prefix);
      }
    });
  }

  return { avatars, labels };
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isRTL, locale, setLocale, t } = useLocale();
  const params = useLocalSearchParams();
  const homeTabParam = typeof params.homeTab === 'string' ? params.homeTab : '';
  const refreshParam = typeof params.refresh === 'string' ? params.refresh : '';
  const scrollParam = typeof params.scrollY === 'string' ? params.scrollY : '';
  const emailConfirmedParam = typeof params.emailConfirmed === 'string' ? params.emailConfirmed : '';
  const skipLaunchParam = typeof params.skipLaunch === 'string' ? params.skipLaunch : '';
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<{ title: string; url: string } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [forceLoggedOut, setForceLoggedOut] = useState(false);
  const [pendingLocalLogout, setPendingLocalLogoutState] = useState(getPendingLocalLogout());
  const [debugStage, setDebugStage] = useState('init');
  const [startupDebugLines, setStartupDebugLines] = useState<string[]>([]);
  const [homeHeaderMenuOpenKey, setHomeHeaderMenuOpenKey] = useState(0);
  const [homeHeaderMenuVisible, setHomeHeaderMenuVisible] = useState(false);
  const [homeSearch, setHomeSearch] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authHydrating, setAuthHydrating] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(Boolean(rememberedHomeFeed?.items?.length));
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>(
    rememberedHomeFeed?.items ?? []
  );
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const avatarIdsKeyRef = useRef<string>('');
  const listRef = useRef<FlatList>(null);
  const scrollYRef = useRef(0);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [orderVendor, setOrderVendor] = useState<string | null>(null);
  const [resolvedGlobalUserId, setResolvedGlobalUserId] = useState<string | null>(null);
  const [resolvedGlobalDishIds, setResolvedGlobalDishIds] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string | null;
    title: string | null;
    subtitle: string | null;
  } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debouncedHomeSearch, setDebouncedHomeSearch] = useState('');
  const [activeHomeTab, setActiveHomeTab] = useState<HomeTabKey>('dishes');
  const [hasVisitedRestaurantsTab, setHasVisitedRestaurantsTab] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const dishAssociationsCountRef = useRef(0);
  const dishAssociationsRef = useRef<DishAssociation[]>(rememberedHomeFeed?.items ?? []);
  const cacheHydratedRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const guestActivationInFlightRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const bootstrapRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocalLogoutRef = useRef(pendingLocalLogout);
  const authBootstrapUserIdRef = useRef<string | null>(null);
  const skipNextSignedInAutoLoadUserRef = useRef<string | null>(null);
  const sessionAccessTokenRef = useRef<string | null>(null);
  const startupRecoveryTriedRef = useRef(false);
  const loadDishAssociationsRef = useRef<
    ((options?: { useCache?: boolean; showLoading?: boolean }) => Promise<void>) | null
  >(null);
  const fabPulse = useRef(new Animated.Value(1)).current;
  const hasPulsedFabRef = useRef(false);
  const handledEmailConfirmedRef = useRef(false);

  const upsertStartupDebugLine = useCallback((prefix: string, value: string) => {
    setStartupDebugLines((prev) => {
      const next = prev.filter((line) => !line.startsWith(`${prefix}=`));
      next.push(`${prefix}=${value}`);
      return next;
    });
  }, []);

  const setBootStep = useCallback((step: string, value?: string | null) => {
    upsertStartupDebugLine('boot.step', step);
    if (value != null) {
      upsertStartupDebugLine(`boot.${step}`, value);
    }
  }, [upsertStartupDebugLine]);

  const getHomeCacheKey = (userId: string | null) => `home_dishes_cache:v2:${userId ?? 'guest'}`;

  const toLocalizedAuthError = (message: string) => {
    const lower = message.toLowerCase();
    if (lower.includes('invalid login credentials')) return t('authInvalidCredentials');
    if (lower.includes('email not confirmed')) return t('authEmailNotConfirmed');
    if (lower.includes('user already registered') || lower.includes('already registered')) return t('authUserExists');
    if (lower.includes('password should be at least')) return t('authPasswordTooShort');
    if (lower.includes('signup is disabled')) return t('authSignupDisabled');
    if (lower.includes('email rate limit exceeded')) return t('authRateLimit');
    if (lower.includes('database error saving new user')) return t('authCompanyMatchError');
    if (lower.includes('no company matches email domain')) return t('authEmailDomainUnknown');
    if (lower.includes('missing email domain')) return t('authEmailDomainMissing');
    return t('authGenericError');
  };

  const resetAuthForm = useCallback(() => {
    setEmail('');
    setPass('');
    setConfirmPass('');
    setShowPass(false);
    setShowConfirmPass(false);
    setAcceptedTerms(false);
    setAuthError(null);
    setAuthLoading(false);
  }, []);

  const loadUserAvatars = async (items: DishAssociation[]) => {
    const ids = Array.from(
      new Set(items.map((item) => item.user_id).filter(Boolean) as string[])
    );
    const avatarKey = [...ids].sort().join(',');
    if (
      avatarKey &&
      avatarKey === avatarIdsKeyRef.current &&
      Object.keys(userAvatars).length > 0
    ) {
      return;
    }
    avatarIdsKeyRef.current = avatarKey;
    if (ids.length === 0) {
      setUserAvatars({});
      setUserLabels({});
      return;
    }
    const { avatars, labels } = await fetchUserAvatarMaps(ids);
    if (ids.length > 0 && Object.keys(avatars).length === 0 && Object.keys(userAvatars).length > 0) {
      return;
    }
    setUserAvatars(avatars);
    setUserLabels(labels);
  };

  useEffect(() => {
    avatarIdsKeyRef.current = '';
    setUserAvatars({});
    setUserLabels({});
  }, [currentUserId]);


  const loadDishAssociations = useCallback(async (options?: {
    useCache?: boolean;
    showLoading?: boolean;
    guestModeOverride?: boolean;
    userIdOverride?: string | null;
    userEmailOverride?: string | null;
    companyIdOverride?: string | null;
  }) => {
    const requestId = ++loadRequestIdRef.current;
    const isCurrentRequest = () => loadRequestIdRef.current === requestId;
    let renderedCachedFeed = false;

    try {
      upsertStartupDebugLine('load.start', String(Date.now()));
      const shouldShowLoading = options?.showLoading ?? true;
      if (shouldShowLoading) {
        setHasLoaded(false);
      }
      if (shouldShowLoading || !hasLoaded) setLoading(true);
      setError(null);
      const userId = options?.userIdOverride ?? currentUserId;
      const userEmail = options?.userEmailOverride ?? currentUserEmail;
      upsertStartupDebugLine('load.userId', userId ?? '-');
      upsertStartupDebugLine('load.email', userEmail ?? '-');
      const guestModeEnabled =
        options?.guestModeOverride ?? (!userId ? isGuestMode || (await loadGuestMode()) : false);
      upsertStartupDebugLine('load.guest', guestModeEnabled ? '1' : '0');
      if (!userId && guestModeEnabled) {
        upsertStartupDebugLine('load.path', 'guest');
        console.info('[guest-mode] loading home feed for guest');
        const [globalRows, globalContext] = await Promise.all([
          fetchGlobalDishes(),
          fetchGlobalCompanyContext(),
        ]);
        if (!isCurrentRequest()) return;
        const resolvedGlobalLogoUrl = resolveLogoUrl(globalContext?.logoUrl ?? null);
        console.info('[guest-mode] guest home feed resolved', {
          dishes: globalRows.length,
          hasContext: Boolean(globalContext),
          hasLogo: Boolean(resolvedGlobalLogoUrl),
          orderVendor: globalContext?.orderVendor ?? null,
        });
        setDishAssociations(globalRows as DishAssociation[]);
        await loadUserAvatars(globalRows as DishAssociation[]);
        setFavorites({});
        setCompanyLogoPath(globalContext?.logoUrl ?? null);
        setCompanyLogoUrl(resolvedGlobalLogoUrl);
        setOrderVendor(globalContext?.orderVendor ?? null);
        setResolvedGlobalUserId(globalContext?.userId ?? null);
        setResolvedGlobalDishIds(globalRows.map((row: any) => String(row.id)).filter(Boolean));
        await cacheScopedLogo({
          logoUrl: resolvedGlobalLogoUrl,
          logoPath: globalContext?.logoUrl ?? null,
        }, 'guest');
        return;
      }
      if (options?.useCache && userId && !cacheHydratedRef.current) {
        upsertStartupDebugLine('load.cacheAttempt', '1');
        const cachedRaw = await withTimeout(
          AsyncStorage.getItem(getHomeCacheKey(userId)),
          500,
          null
        );
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached?.items) && cached.items.length > 0) {
              if (!isCurrentRequest()) return;
              setDishAssociations(cached.items as DishAssociation[]);
              loadUserAvatars(cached.items as DishAssociation[]);
              setHasLoaded(true);
              setLoading(false);
              cacheHydratedRef.current = true;
              renderedCachedFeed = true;
              upsertStartupDebugLine('load.cacheHit', String(cached.items.length));
            }
          } catch {
            await AsyncStorage.removeItem(getHomeCacheKey(userId));
          }
        }
      }
      if (userId) {
        let companyId: string | null = options?.companyIdOverride ?? null;
        if (companyId) {
          upsertStartupDebugLine('load.companyIdOverride', companyId);
          primeCompanyIdForUser(userId, companyId);
        }
        if (userEmail) {
          if (companyId) {
            upsertStartupDebugLine('load.companyIdDomain', companyId);
          } else {
          const domain = userEmail.includes('@')
            ? userEmail.split('@').pop()?.trim().toLowerCase()
            : null;
          if (domain) {
            const domainLookup = await withTimeout(
              (async () =>
                await supabase
                  .from('companies')
                  .select('id')
                  .ilike('domain', domain)
                  .limit(1)
                  .maybeSingle())(),
              HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS,
              { data: null, error: null } as any
            );
            const companyFromDomain = domainLookup.data;
            const companyDomainError = domainLookup.error;
            if (companyDomainError) throw companyDomainError;
            companyId = companyFromDomain?.id ?? null;
            upsertStartupDebugLine('load.companyIdDomain', companyId ?? '-');
            if (companyId) {
              primeCompanyIdForUser(userId, companyId);
            }
          }
          }
        }
        if (!companyId) {
          companyId = await withTimeout(
            fetchCompanyIdForUser(userId).catch(() => null),
            HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS,
            null
          );
        }
        upsertStartupDebugLine('load.companyId', companyId ?? '-');
        if (!isCurrentRequest()) return;
        if (companyId) {
          upsertStartupDebugLine('load.path', 'signed-in-company');
          const rpcPromise = withTimeout(
            fetchVisibleDishes(companyId).catch(() => [] as DishAssociation[]),
            HOME_FEED_RPC_TIMEOUT_MS,
            [] as DishAssociation[]
          );
          const companyRowsPromise = withTimeout(
            fetchCompanyDishes(companyId).catch(() => [] as DishAssociation[]),
            HOME_FEED_RPC_TIMEOUT_MS,
            [] as DishAssociation[]
          );

          const finalFeedPromise = (async () => {
            const [rpcData, companyRows, globalContext, globalRows] = await Promise.all([
              rpcPromise,
              companyRowsPromise,
              fetchGlobalCompanyContext(),
              fetchGlobalDishes(),
            ]);
            upsertStartupDebugLine('load.rpcVisibleCount', String(Array.isArray(rpcData) ? rpcData.length : -1));
            upsertStartupDebugLine('load.rpcCompanyCount', String(Array.isArray(companyRows) ? companyRows.length : -1));
            upsertStartupDebugLine('load.globalCount', String(globalRows.length));
            if (!Array.isArray(rpcData)) {
              return null;
            }
            const refinedSorted = mergeCompanyVisibleRows(
              (rpcData as DishAssociation[]) ?? [],
              (companyRows as DishAssociation[]) ?? [],
              [],
              globalContext?.userId ?? null
            );
            return {
              rows: refinedSorted as DishAssociation[],
              globalUserId: globalContext?.userId ?? null,
              globalDishIds: globalRows.map((row: any) => String(row.id)).filter(Boolean),
            };
          })();

          const applyResolvedFeed = async (resolvedFeed: {
            rows: DishAssociation[];
            globalUserId: string | null;
            globalDishIds: string[];
          }) => {
            if (!isCurrentRequest()) return;
            setResolvedGlobalUserId(resolvedFeed.globalUserId);
            setResolvedGlobalDishIds(resolvedFeed.globalDishIds);
            setDishAssociations(resolvedFeed.rows);
            loadUserAvatars(resolvedFeed.rows);
            setHasLoaded(true);
            setLoading(false);
            upsertStartupDebugLine('load.appliedRows', String(resolvedFeed.rows.length));
            if (userId) {
              await AsyncStorage.setItem(
                getHomeCacheKey(userId),
                JSON.stringify({ updatedAt: Date.now(), items: resolvedFeed.rows })
              );
            }
          };

          if (renderedCachedFeed) {
            void (async () => {
              try {
                const resolvedFeed = await finalFeedPromise;
                if (!resolvedFeed) return;
                await applyResolvedFeed(resolvedFeed);
              } catch {}
            })();
            return;
          }

          const resolvedFeed = await withTimeout(finalFeedPromise, HOME_FEED_FINAL_WAIT_MS, null);

          if (resolvedFeed) {
            await applyResolvedFeed(resolvedFeed);
            return;
          }

          const fallbackCompanyRows = (await companyRowsPromise) as DishAssociation[];
          upsertStartupDebugLine('load.fallbackRows', String(fallbackCompanyRows.length));
          if (!isCurrentRequest()) return;
          if (fallbackCompanyRows.length === 0 && dishAssociationsRef.current.length > 0) {
            upsertStartupDebugLine('load.preserveExisting', 'fallback-empty');
            setDishAssociations(dishAssociationsRef.current);
            setHasLoaded(true);
            setLoading(false);
            return;
          }
          setResolvedGlobalUserId(null);
          setResolvedGlobalDishIds([]);
          setDishAssociations(fallbackCompanyRows);
          loadUserAvatars(fallbackCompanyRows);
          setHasLoaded(true);
          setLoading(false);
          if (userId) {
            await AsyncStorage.setItem(
              getHomeCacheKey(userId),
              JSON.stringify({ updatedAt: Date.now(), items: fallbackCompanyRows })
            );
          }
          return;
        }
      }
      if (!isCurrentRequest()) return;
      if (userId && dishAssociationsRef.current.length > 0) {
        upsertStartupDebugLine('load.preserveExisting', 'no-company');
        setDishAssociations(dishAssociationsRef.current);
        setHasLoaded(true);
        setLoading(false);
        return;
      }
      setDishAssociations([]);
      loadUserAvatars([]);
      setFavorites({});
      setResolvedGlobalUserId(null);
      setResolvedGlobalDishIds([]);
      upsertStartupDebugLine('load.empty', '1');
      return;
    } catch (err) {
      if (!isCurrentRequest()) return;
      setError(err instanceof Error ? err.message : 'Unknown error');
      upsertStartupDebugLine('load.error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
        setHasLoaded(true);
        upsertStartupDebugLine('load.final', `loading=0 hasLoaded=1 dishes=${dishAssociationsCountRef.current}`);
      }
    }
  }, [currentUserEmail, currentUserId, hasLoaded, isGuestMode, upsertStartupDebugLine]);

  useEffect(() => {
    dishAssociationsCountRef.current = dishAssociations.length;
    dishAssociationsRef.current = dishAssociations;
  }, [dishAssociations.length]);

  useEffect(() => {
    if (isAuthenticated && currentUserId && dishAssociations.length > 0) {
      rememberedHomeFeed = {
        userId: currentUserId,
        items: dishAssociations,
      };
      return;
    }

    if (!isAuthenticated && !isGuestMode) {
      rememberedHomeFeed = null;
    }
  }, [currentUserId, dishAssociations, isAuthenticated, isGuestMode]);

  useEffect(() => {
    let cancelled = false;

    if (!currentUserId || dishAssociations.length > 0 || hasLoaded) {
      return () => {
        cancelled = true;
      };
    }

    const hydrateRememberedFeed = async () => {
      if (rememberedHomeFeed?.userId === currentUserId && rememberedHomeFeed.items.length > 0) {
        if (!cancelled) {
          setDishAssociations(rememberedHomeFeed.items);
          setHasLoaded(true);
          setLoading(false);
        }
        return;
      }

      const cachedRaw = await AsyncStorage.getItem(getHomeCacheKey(currentUserId));
      if (!cachedRaw || cancelled) {
        return;
      }

      try {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached?.items) && cached.items.length > 0 && !cancelled) {
          setDishAssociations(cached.items as DishAssociation[]);
          setHasLoaded(true);
          setLoading(false);
          rememberedHomeFeed = {
            userId: currentUserId,
            items: cached.items as DishAssociation[],
          };
          void loadUserAvatars(cached.items as DishAssociation[]);
        }
      } catch {
        // Ignore malformed cache and let the live fetch path recover.
      }
    };

    void hydrateRememberedFeed();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, dishAssociations.length, hasLoaded]);

  const loadFavorites = useCallback(async (userId: string) => {
    try {
      setFavorites(await fetchFavoritesMap(userId));
    } catch {}
  }, []);

  const waitForStableSessionUser = useCallback(async (expectedUserId: string) => {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id === expectedUserId) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }, []);

  const toggleFavorite = useCallback(async (dishAssociationId: string) => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    const isFav = Boolean(favorites[dishAssociationId]);
    setFavorites((prev) => ({ ...prev, [dishAssociationId]: !isFav }));
    try {
      if (isFav) {
        const { error } = await supabase
          .from('dish_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('dish_association_id', dishAssociationId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dish_favorites').insert({
          user_id: userId,
          dish_association_id: dishAssociationId,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    } catch {
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  }, [favorites]);

  const deleteDishAssociation = useCallback(async (dish: DishAssociation) => {
    showAppDialog({
      title: t('dishDeleteTitle'),
      message: t('dishDeleteMessage'),
      actions: [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('commonDelete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!currentUserId) {
                showAppAlert(t('accountUnauthorized'), t('accountReloginToDelete'));
                return;
              }
              if (dish.user_id !== currentUserId) {
                showAppAlert(t('accountUnauthorized'), t('dishDeleteUnauthorized'));
                return;
              }
              if (dish.image_path) {
                await supabase.storage.from('dish-images').remove([dish.image_path]);
              }
              await supabase.from('dish_favorites').delete().eq('dish_association_id', dish.id);
              const { error } = await supabase
                .from('dish_associations')
                .delete()
                .eq('id', dish.id)
                .eq('user_id', currentUserId);
              if (error) throw error;

              setDishAssociations((prev) => prev.filter((item) => item.id !== dish.id));
              setFavorites((prev) => {
                const next = { ...prev };
                delete next[dish.id];
                return next;
              });
              await loadDishAssociationsRef.current?.({ showLoading: false });
            } catch {
              showAppAlert(t('accountDeleteFailed'), t('accountDeleteFailed'));
            }
          },
        },
      ],
    });
  }, [currentUserId, t]);

  const ensureAppUserProfile = useCallback(async (userId: string, emailAddress: string | null | undefined) => {
    const normalizedEmail = emailAddress?.trim().toLowerCase() ?? '';
    if (!userId || !normalizedEmail) return;

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('AppUsers')
      .select('user_id, email, company_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingProfileError) {
      throw existingProfileError;
    }

    if (existingProfile?.user_id && existingProfile.company_id) {
      primeCompanyIdForUser(userId, existingProfile.company_id ?? null);
      return;
    }

    const domain = getEmailDomain(normalizedEmail);
    if (!domain) {
      throw new Error('missing email domain');
    }

    const { data: companyMatch, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .ilike('domain', domain)
      .limit(1)
      .maybeSingle();

    if (companyError) {
      throw companyError;
    }

    if (!companyMatch?.id) {
      throw new Error('no company matches email domain');
    }

    const { data: existingByEmail, error: existingByEmailError } = await supabase
      .from('AppUsers')
      .select('user_id, email')
      .ilike('email', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (existingByEmailError) {
      throw existingByEmailError;
    }

    if (existingByEmail?.email) {
      const { error: recoverError } = await supabase
        .from('AppUsers')
        .update({
          user_id: userId,
          company_id: companyMatch.id,
          email: normalizedEmail,
        })
        .ilike('email', normalizedEmail);
      if (recoverError) {
        throw recoverError;
      }
      clearUserScopedCaches(userId);
      primeCompanyIdForUser(userId, companyMatch.id);
      return;
    }

    if (existingProfile?.user_id) {
      const { error: repairExistingProfileError } = await supabase
        .from('AppUsers')
        .update({
          company_id: companyMatch.id,
          email: normalizedEmail,
        })
        .eq('user_id', userId);
      if (repairExistingProfileError) {
        throw repairExistingProfileError;
      }
      clearUserScopedCaches(userId);
      primeCompanyIdForUser(userId, companyMatch.id);
      return;
    }

    const { error: insertError } = await supabase.from('AppUsers').insert({
      user_id: userId,
      email: normalizedEmail,
      company_id: companyMatch.id,
    });
    if (insertError) {
      throw insertError;
    }
    clearUserScopedCaches(userId);
    primeCompanyIdForUser(userId, companyMatch.id);
  }, []);

  const hydrateSignedInHome = useCallback(
    async (userId: string, emailAddress: string | null | undefined, accessToken?: string | null) => {
      setAuthHydrating(true);
      try {
        setBootStep('start', userId.slice(0, 8));
        let companyIdFromDomain: string | null = null;
        let bootstrapCompanyLogoPath: string | null = null;
        let bootstrapOrderVendor: string | null = null;
        const domain = getEmailDomain(emailAddress ?? null);
        if (domain) {
          setBootStep('domain', domain);
          const bootstrapCompany = await withTimeout(
            fetchBootstrapCompanyByDomain(domain, accessToken),
            HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS,
            null
          );
          companyIdFromDomain = bootstrapCompany?.id ?? null;
          bootstrapCompanyLogoPath = bootstrapCompany?.logo_url ?? null;
          bootstrapOrderVendor = bootstrapCompany?.order_vendor ?? null;
          upsertStartupDebugLine('boot.companyIdDomain', companyIdFromDomain ?? '-');
          if (companyIdFromDomain) {
            primeCompanyIdForUser(userId, companyIdFromDomain);
            setCompanyLogoPath(bootstrapCompanyLogoPath);
            setCompanyLogoUrl(resolveLogoUrl(bootstrapCompanyLogoPath));
            setOrderVendor(bootstrapOrderVendor);
          }
        }
        if (!companyIdFromDomain) {
          const appUserLookup = await withTimeout(
            (async () =>
              await supabase
                .from('AppUsers')
                .select('company_id')
                .or(`user_id.eq.${userId},email.ilike.${(emailAddress ?? '').trim().toLowerCase()}`)
                .not('company_id', 'is', null)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle())(),
            2000,
            { data: null, error: null } as any
          );
          const appUserCompanyId = appUserLookup.data?.company_id ?? null;
          upsertStartupDebugLine('boot.appUserCompanyId', appUserCompanyId ?? '-');
          if (appUserCompanyId) {
            companyIdFromDomain = appUserCompanyId;
            primeCompanyIdForUser(userId, appUserCompanyId);
            const bootstrapCompany = await withTimeout(
              fetchBootstrapCompanyById(appUserCompanyId, accessToken),
              HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS,
              null
            );
            bootstrapCompanyLogoPath = bootstrapCompany?.logo_url ?? null;
            bootstrapOrderVendor = bootstrapCompany?.order_vendor ?? null;
            setCompanyLogoPath(bootstrapCompanyLogoPath);
            setCompanyLogoUrl(resolveLogoUrl(bootstrapCompanyLogoPath));
            setOrderVendor(bootstrapOrderVendor);
          }
        }
        setBootStep('profile-repair', 'bg');
        void withTimeout(
          ensureAppUserProfile(userId, emailAddress ?? null),
          4000,
          null
        ).catch(() => null);

        setBootStep('feed', companyIdFromDomain ?? '-');
        await Promise.all([
          withTimeout(loadFavorites(userId), 1500, null),
          (async () => {
            if (companyIdFromDomain && accessToken) {
              const visibleRows = await withTimeout(
                fetchBootstrapVisibleRows(companyIdFromDomain, accessToken),
                5000,
                [] as DishAssociation[]
              );
              const companyRows = await withTimeout(
                fetchBootstrapCompanyRows(companyIdFromDomain, accessToken),
                5000,
                [] as DishAssociation[]
              );
              const bootstrapRows = mergeCompanyVisibleRows(
                visibleRows as DishAssociation[],
                companyRows as DishAssociation[],
                [],
                null
              );
              const bootstrapAvatarIds = Array.from(
                new Set(
                  bootstrapRows
                    .map((row) => row.user_id)
                    .filter(Boolean) as string[]
                )
              );
              const bootstrapAvatarMaps = await fetchBootstrapUserAvatarMaps(
                bootstrapAvatarIds,
                accessToken
              );
              setDishAssociations(bootstrapRows);
              setUserAvatars(bootstrapAvatarMaps.avatars);
              setUserLabels(bootstrapAvatarMaps.labels);
              avatarIdsKeyRef.current = [...bootstrapAvatarIds].sort().join(',');
              if (!avatarUrl && bootstrapAvatarMaps.avatars[userId]) {
                setAvatarUrl(bootstrapAvatarMaps.avatars[userId]);
                await cacheAvatar(userId, bootstrapAvatarMaps.avatars[userId]);
              }
              setResolvedGlobalUserId(null);
              setResolvedGlobalDishIds([]);
              setHasLoaded(true);
              setLoading(false);
              skipNextSignedInAutoLoadUserRef.current = userId;
              await AsyncStorage.setItem(
                getHomeCacheKey(userId),
                JSON.stringify({ updatedAt: Date.now(), items: bootstrapRows })
              );
              upsertStartupDebugLine('boot.feedRows', String(bootstrapRows.length));
              return;
            }
            await withTimeout(
              loadDishAssociations({
                useCache: true,
                showLoading: false,
                userIdOverride: userId,
                userEmailOverride: emailAddress ?? null,
                companyIdOverride: companyIdFromDomain,
              }),
              7000,
              null
            );
          })(),
        ]);
        setBootStep('done', String(dishAssociationsCountRef.current));
      } finally {
        setAuthHydrating(false);
      }
    },
    [dishAssociationsCountRef, ensureAppUserProfile, loadDishAssociations, loadFavorites, setBootStep, upsertStartupDebugLine]
  );

  useEffect(() => {
    if (emailConfirmedParam !== '1' || handledEmailConfirmedRef.current) return;
    setDebugStage('effect:email-confirmed');
    handledEmailConfirmedRef.current = true;
    setShowSignup(false);
    setAuthError(null);
    showAppDialog({
      title: t('authEmailConfirmedTitle'),
      message: t('authEmailConfirmedMessage'),
    });
    router.replace('/');
  }, [emailConfirmedParam, router, t]);

  useEffect(() => {
    return subscribePendingLocalLogout((pending) => {
      setPendingLocalLogoutState(pending);
      if (pending) {
        setDebugStage('logout-gate:pending');
        resetAuthForm();
      }
    });
  }, [resetAuthForm]);

  useEffect(() => {
    if (skipLaunchParam !== '1') return;
    setDebugStage('effect:skiplaunch-force-logged-out');
    setForceLoggedOut(true);
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setCurrentUserId(null);
    setCurrentUserEmail(null);
    setIsRefreshing(false);
    setLoading(false);
    setHasLoaded(false);
    setDishAssociations([]);
    setFavorites({});
    setCompanyLogoUrl(null);
    setCompanyLogoPath(null);
    setOrderVendor(null);
    setResolvedGlobalUserId(null);
    setResolvedGlobalDishIds([]);
    rememberedHomeFeed = null;
    resetAuthForm();
    setSessionChecked(true);
    setPendingLocalLogoutState(true);
  }, [resetAuthForm, skipLaunchParam]);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!isAuthenticated || !currentUserId) return;
    if (pendingLocalLogout || skipLaunchParam === '1') return;

    setHomeSearch('');
    publishHomeTab('dishes');
    setActiveHomeTab('dishes');
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      scrollYRef.current = 0;
    }, 0);

    return () => clearTimeout(id);
  }, [currentUserId, isAuthenticated, pendingLocalLogout, sessionChecked, skipLaunchParam]);

  useEffect(() => {
    if (skipLaunchParam === '1') return;
    if ((currentUserId || isAuthenticated || isGuestMode) && !pendingLocalLogout) {
      setDebugStage('effect:clear-force-logged-out');
      setForceLoggedOut(false);
    }
  }, [currentUserId, isAuthenticated, isGuestMode, pendingLocalLogout, skipLaunchParam]);

  useEffect(() => {
    pendingLocalLogoutRef.current = pendingLocalLogout;
  }, [pendingLocalLogout]);

  useEffect(() => {
    if (!currentUserId || !isAuthenticated || !pendingLocalLogout) return;
    setPendingLocalLogout(false);
    setPendingLocalLogoutState(false);
  }, [currentUserId, isAuthenticated, pendingLocalLogout]);

  useEffect(() => {
    upsertStartupDebugLine('render.stage', debugStage);
    upsertStartupDebugLine('render.sessionChecked', sessionChecked ? '1' : '0');
    upsertStartupDebugLine('render.auth', isAuthenticated ? '1' : '0');
    upsertStartupDebugLine('render.authHydrating', authHydrating ? '1' : '0');
    upsertStartupDebugLine('render.guest', isGuestMode ? '1' : '0');
    upsertStartupDebugLine('render.uid', currentUserId ? currentUserId.slice(0, 8) : '-');
    upsertStartupDebugLine('render.loading', loading ? '1' : '0');
    upsertStartupDebugLine('render.hasLoaded', hasLoaded ? '1' : '0');
    upsertStartupDebugLine('render.dishes', String(dishAssociations.length));
    upsertStartupDebugLine('render.logo', companyLogoUrl ? '1' : '0');
    upsertStartupDebugLine('render.avatar', avatarUrl ? '1' : '0');
    upsertStartupDebugLine('render.pendingLogout', pendingLocalLogout ? '1' : '0');
    upsertStartupDebugLine('render.error', error ?? '-');
  }, [
    authHydrating,
    avatarUrl,
    companyLogoUrl,
    currentUserId,
    debugStage,
    dishAssociations.length,
    error,
    hasLoaded,
    isAuthenticated,
    isGuestMode,
    loading,
    pendingLocalLogout,
    sessionChecked,
    upsertStartupDebugLine,
  ]);

  useEffect(() => {
    let mounted = true;
    setDebugStage('session:getSession:start');
    supabase.auth.getSession().then(async ({ data }) => {
      try {
        if (!mounted) return;
        setAuthHydrating(Boolean(data.session?.user?.id));
        sessionAccessTokenRef.current = data.session?.access_token ?? null;
        if (data.session?.user?.id) {
          setPendingLocalLogout(false);
          setPendingLocalLogoutState(false);
        }
        const guestModeEnabled = !data.session ? await loadGuestMode() : false;
        const logoCacheScope = getLogoCacheScope(
          data.session?.user?.id ?? null,
          data.session?.user?.email ?? null,
          guestModeEnabled
        );
        setIsGuestMode(guestModeEnabled);
        setIsAuthenticated(Boolean(data.session));
        setCurrentUserId(data.session?.user?.id ?? null);
        setCurrentUserEmail(data.session?.user?.email ?? null);
        if (!data.session && !guestModeEnabled && skipLaunchParam === '1') {
          setDebugStage('session:getSession:no-session-skiplaunch');
          setForceLoggedOut(true);
          setPendingLocalLogoutState(true);
        } else {
          setDebugStage(
            data.session?.user?.id
              ? 'session:getSession:has-session'
              : guestModeEnabled
                ? 'session:getSession:guest'
                : 'session:getSession:logged-out'
          );
          if (!pendingLocalLogoutRef.current || data.session?.user?.id || guestModeEnabled) {
            setForceLoggedOut(false);
          }
        }
        if (data.session?.user?.id || guestModeEnabled) {
          setPendingLocalLogout(false);
          setPendingLocalLogoutState(false);
        }
        setIsRefreshing(false);
        setSessionChecked(true);
        void (async () => {
          const [cachedAvatar, cached] = await Promise.all([
            loadCachedAvatar(data.session?.user?.id ?? null),
            loadCachedLogo(logoCacheScope),
          ]);
          if (!mounted) return;
          if (cachedAvatar) setAvatarUrl(cachedAvatar);
          if (cached.logoUrl || cached.logoPath) {
            const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
            setCompanyLogoUrl(resolved);
            setCompanyLogoPath(cached.logoPath);
          }
          const userId = data.session?.user?.id ?? null;
          const resolvedAvatar = await withTimeout(
            resolveAvatarForUser(
              userId,
              (data.session?.user?.user_metadata as any)?.avatar_url ?? null
            ),
            1200,
            null
          );
          if (!mounted || !resolvedAvatar) return;
          setAvatarUrl(resolvedAvatar);
          await cacheAvatar(userId, resolvedAvatar);
        })();
        if (data.session?.user?.id) {
          void setGuestModeEnabled(false);
          try {
            setDebugStage('session:getSession:hydrate-signed-in');
            await hydrateSignedInHome(
              data.session.user.id,
              data.session.user.email ?? null,
              data.session.access_token ?? null
            );
            if (!mounted) return;
            setDebugStage('session:getSession:signed-in-ready');
          } catch (hydrateError) {
            if (!mounted) return;
            console.warn('[home] cold-start signed-in hydration failed', hydrateError);
          }
        } else if (guestModeEnabled) {
          setAuthHydrating(false);
          setDebugStage('session:getSession:guest-ready');
        } else {
          setAuthHydrating(false);
          setDebugStage('session:getSession:logged-out-ready');
          resetAuthForm();
          setDishAssociations([]);
          setFavorites({});
          rememberedHomeFeed = null;
        }
      } catch (error) {
        setDebugStage('session:getSession:error');
        console.warn('[guest-mode] initial session bootstrap failed', error);
        setDishAssociations([]);
        setFavorites({});
        setError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        if (mounted) {
          setAuthHydrating(false);
        }
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setDebugStage(`auth-change:${session?.user?.id ? 'signed-in' : 'signed-out'}`);
      setAuthHydrating(Boolean(session?.user?.id));
      setSessionChecked(true);
      setIsAuthenticated(Boolean(session));
      setCurrentUserId(session?.user?.id ?? null);
      setCurrentUserEmail(session?.user?.email ?? null);
      sessionAccessTokenRef.current = session?.access_token ?? null;
      if (session?.user?.id) {
        setPendingLocalLogout(false);
        setPendingLocalLogoutState(false);
      }
      if (!session && skipLaunchParam === '1') {
        setDebugStage('auth-change:signed-out-skiplaunch');
        setForceLoggedOut(true);
        setPendingLocalLogoutState(true);
      } else {
        if (!pendingLocalLogoutRef.current || session?.user?.id) {
          setForceLoggedOut(false);
        }
      }
      setIsRefreshing(false);
      const resolvedAvatar = await withTimeout(
        resolveAvatarForUser(
          session?.user?.id ?? null,
          (session?.user?.user_metadata as any)?.avatar_url ?? null
        ),
        1200,
        null
      );
      if (resolvedAvatar) {
        setAvatarUrl(resolvedAvatar);
        cacheAvatar(session?.user?.id ?? null, resolvedAvatar);
      } else {
        setAvatarUrl(null);
        cacheAvatar(session?.user?.id ?? null, null);
      }
      if (session?.user?.id) {
        setPendingLocalLogout(false);
        setPendingLocalLogoutState(false);
        setIsGuestMode(false);
        await setGuestModeEnabled(false);
        if (authBootstrapUserIdRef.current === session.user.id) {
          setDebugStage('auth-change:signed-in-deferred');
          return;
        }
        try {
          await hydrateSignedInHome(
            session.user.id,
            session.user.email ?? null,
            session.access_token ?? null
          );
          setDebugStage('auth-change:signed-in-ready');
        } finally {
          setAuthHydrating(false);
        }
      } else {
        setAuthHydrating(false);
        const guestModeEnabled = await loadGuestMode();
        setIsGuestMode(guestModeEnabled);
        if (guestModeEnabled) {
          setDebugStage('auth-change:guest-ready');
          setFavorites({});
        } else {
          setDebugStage('auth-change:signed-out-ready');
          resetAuthForm();
          setDishAssociations([]);
          setCompanyLogoUrl(null);
          setOrderVendor(null);
          setFavorites({});
          rememberedHomeFeed = null;
        }
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [ensureAppUserProfile, resetAuthForm, router, skipLaunchParam]);

  useEffect(() => {
    let cancelled = false;

    const hydrateBranding = async () => {
      if (currentUserId) {
        try {
          const resolvedLogo = await loadSessionCompanyLogo(currentUserId, currentUserEmail ?? null, {
            forceRefresh: true,
          });
          if (cancelled) return;
          setCompanyLogoUrl(resolvedLogo.logoUrl);
          setCompanyLogoPath(resolvedLogo.logoPath);
          setOrderVendor(resolvedLogo.orderVendor);
        } catch {
          if (cancelled) return;
          setCompanyLogoUrl(null);
          setCompanyLogoPath(null);
          setOrderVendor(null);
        }
        return;
      }

      if (isGuestMode) {
        const globalContext = await fetchGlobalCompanyContext();
        if (cancelled) return;
        const resolvedGlobalLogoUrl = resolveLogoUrl(globalContext?.logoUrl ?? null);
        setCompanyLogoPath(globalContext?.logoUrl ?? null);
        setCompanyLogoUrl(resolvedGlobalLogoUrl);
        setOrderVendor(globalContext?.orderVendor ?? null);
        await cacheScopedLogo(
          {
            logoUrl: resolvedGlobalLogoUrl,
            logoPath: globalContext?.logoUrl ?? null,
          },
          'guest'
        );
        return;
      }

      setCompanyLogoUrl(null);
      setCompanyLogoPath(null);
      setOrderVendor(null);
    };

    void hydrateBranding();

    return () => {
      cancelled = true;
    };
  }, [currentUserEmail, currentUserId, isGuestMode]);

  useEffect(() => {
    loadDishAssociationsRef.current = loadDishAssociations;
  }, [loadDishAssociations]);

  useEffect(() => {
    if (companyLogoUrl) {
      const logoCacheScope = getLogoCacheScope(currentUserId, currentUserEmail, isGuestMode);
      cacheScopedLogo({ logoUrl: companyLogoUrl, logoPath: companyLogoPath }, logoCacheScope);
    }
  }, [companyLogoUrl, companyLogoPath, currentUserEmail, currentUserId, isGuestMode]);

  useEffect(() => {
    if (authHydrating) {
      return;
    }
    if (currentUserId) {
      if (skipNextSignedInAutoLoadUserRef.current === currentUserId) {
        skipNextSignedInAutoLoadUserRef.current = null;
        return;
      }
      loadDishAssociations({ useCache: true, showLoading: false });
    } else if (isGuestMode) {
      loadDishAssociations({ showLoading: false });
    }
  }, [authHydrating, currentUserId, isGuestMode, loadDishAssociations, refreshParam]);

  useEffect(() => {
    if (bootstrapRetryTimeoutRef.current) {
      clearTimeout(bootstrapRetryTimeoutRef.current);
      bootstrapRetryTimeoutRef.current = null;
    }
    if (authHydrating || !sessionChecked || loading || hasLoaded || error || (!currentUserId && !isGuestMode)) {
      return;
    }
    bootstrapRetryTimeoutRef.current = setTimeout(() => {
      void loadDishAssociations({
        useCache: Boolean(currentUserId),
        showLoading: false,
      });
    }, 2200);
    return () => {
      if (bootstrapRetryTimeoutRef.current) {
        clearTimeout(bootstrapRetryTimeoutRef.current);
        bootstrapRetryTimeoutRef.current = null;
      }
    };
  }, [authHydrating, currentUserId, error, hasLoaded, isGuestMode, loadDishAssociations, loading, sessionChecked]);

  useEffect(() => {
    cacheHydratedRef.current = false;
    startupRecoveryTriedRef.current = false;
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      void loadFavorites(currentUserId);
    } else {
      setFavorites({});
    }
  }, [currentUserId, loadFavorites]);

  useEffect(() => {
    if (!currentUserId || dishAssociations.length === 0) return;
    if (Object.keys(userAvatars).length > 0) return;

    void loadUserAvatars(dishAssociations);
  }, [currentUserId, dishAssociations, userAvatars]);

  useEffect(() => {
    if (!currentUserId || dishAssociations.length === 0) return;
    if (Object.keys(userAvatars).length > 0) return;
    if (!sessionAccessTokenRef.current) return;

    void (async () => {
      const ids = Array.from(
        new Set(dishAssociations.map((item) => item.user_id).filter(Boolean) as string[])
      );
      const directMaps = await fetchBootstrapUserAvatarMaps(ids, sessionAccessTokenRef.current);
      if (Object.keys(directMaps.avatars).length === 0) return;
      setUserAvatars(directMaps.avatars);
      setUserLabels(directMaps.labels);
      avatarIdsKeyRef.current = [...ids].sort().join(',');
      if (!avatarUrl && directMaps.avatars[currentUserId]) {
        setAvatarUrl(directMaps.avatars[currentUserId]);
        await cacheAvatar(currentUserId, directMaps.avatars[currentUserId]);
      }
    })();
  }, [avatarUrl, currentUserId, dishAssociations, userAvatars]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !currentUserEmail) return;
    if (loading || authHydrating || !hasLoaded || error) return;
    if (dishAssociations.length > 0 || startupRecoveryTriedRef.current) return;

    startupRecoveryTriedRef.current = true;
    void (async () => {
      try {
        setDebugStage('startup-recovery:start');
        upsertStartupDebugLine('boot.recovery', 'start');
        const domain = getEmailDomain(currentUserEmail);
        if (!domain) {
          upsertStartupDebugLine('boot.recovery', 'no-domain');
          return;
        }
        const domainLookup = await withTimeout(
          (async () =>
            await supabase
              .from('companies')
              .select('id')
              .ilike('domain', domain)
              .limit(1)
              .maybeSingle())(),
          HOME_FEED_COMPANY_LOOKUP_TIMEOUT_MS,
          { data: null, error: null } as any
        );
        const companyId = domainLookup.data?.id ?? null;
        upsertStartupDebugLine('boot.recoveryCompanyId', companyId ?? '-');
        if (!companyId) {
          setDebugStage('startup-recovery:no-company');
          return;
        }
        primeCompanyIdForUser(currentUserId, companyId);
        await loadDishAssociations({
          useCache: false,
          showLoading: false,
          userIdOverride: currentUserId,
          userEmailOverride: currentUserEmail,
          companyIdOverride: companyId,
        });
        upsertStartupDebugLine('boot.recovery', 'done');
        setDebugStage('startup-recovery:done');
      } catch (recoveryError) {
        upsertStartupDebugLine(
          'boot.recoveryError',
          recoveryError instanceof Error ? recoveryError.message : 'unknown'
        );
        setDebugStage('startup-recovery:error');
      }
    })();
  }, [
    authHydrating,
    currentUserEmail,
    currentUserId,
    dishAssociations.length,
    error,
    hasLoaded,
    isAuthenticated,
    loadDishAssociations,
    loading,
    upsertStartupDebugLine,
  ]);

  useEffect(() => {
    return subscribeAvatarUpdates(({ userId, avatarUrl: nextAvatarUrl }) => {
      if (!currentUserId || userId !== currentUserId) return;
      setAvatarUrl(nextAvatarUrl);
    });
  }, [currentUserId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedHomeSearch(homeSearch);
    }, 250);
    return () => clearTimeout(handle);
  }, [homeSearch]);

  useEffect(() => {
    if ((!isAuthenticated && !isGuestMode) || hasPulsedFabRef.current) return;
    hasPulsedFabRef.current = true;
    Animated.sequence([
      Animated.delay(450),
      Animated.spring(fabPulse, {
        toValue: 1.08,
        useNativeDriver: true,
        speed: 18,
        bounciness: 9,
      }),
      Animated.spring(fabPulse, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
    ]).start();
  }, [fabPulse, isAuthenticated, isGuestMode]);

  const refreshContent = useCallback(
    async (options?: { force?: boolean; showSpinner?: boolean }) => {
      if (!currentUserId && !isGuestMode) return;
      const force = options?.force ?? false;
      const showSpinner = options?.showSpinner ?? false;
      const now = Date.now();
      if (!force && now - lastRefreshRef.current < 60000) {
        return;
      }
      lastRefreshRef.current = now;
      const shouldShowRefreshSpinner = Boolean(
        showSpinner && currentUserId && hasLoaded && (dishAssociations.length > 0 || error)
      );
      try {
        if (currentUserId) {
          if (shouldShowRefreshSpinner) {
            setIsRefreshing(true);
          }
          await Promise.all([
            loadDishAssociations({ showLoading: false }),
            loadFavorites(currentUserId),
          ]);
        } else {
          await loadDishAssociations({ showLoading: false });
        }
      } finally {
        if (shouldShowRefreshSpinner) {
          setIsRefreshing(false);
        }
      }
    },
    [currentUserId, dishAssociations.length, error, hasLoaded, isGuestMode, loadDishAssociations, loadFavorites]
  );

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId || !hasLoaded) return;
      refreshContent();
    }, [currentUserId, hasLoaded, refreshContent])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = /inactive|background/.test(appStateRef.current);
      if (wasInactive && nextState === 'active' && currentUserId && hasLoaded) {
        refreshContent();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [currentUserId, hasLoaded, refreshContent]);

  useEffect(() => {
    if (!isGuestMode) {
      setIsRefreshing(false);
    }
  }, [isGuestMode]);

  useEffect(() => {
    if (!scrollParam) return;
    const offset = Number(scrollParam);
    if (!Number.isFinite(offset)) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    }, 50);
    return () => clearTimeout(id);
  }, [scrollParam]);

  const openLoginFromGuest = useCallback(async () => {
    setDebugStage('guest:open-login');
    await setGuestModeEnabled(false);
    setIsGuestMode(false);
    resetAuthForm();
    setIsRefreshing(false);
    setLoading(false);
    setHasLoaded(false);
    setDishAssociations([]);
    setFavorites({});
    rememberedHomeFeed = null;
    router.replace({
      pathname: '/',
      params: {
        headerSync: String(Date.now()),
        guestMode: '0',
      },
    });
  }, [resetAuthForm, router]);

  const activateGuestMode = useCallback(async () => {
    try {
      setDebugStage('guest:activate-start');
      guestActivationInFlightRef.current = true;
      setAuthLoading(true);
      setAuthError(null);
      setIsRefreshing(false);
      setLoading(false);
      setHasLoaded(false);
      setError(null);
      await setGuestModeEnabled(true);
      setIsGuestMode(true);
      setIsAuthenticated(false);
      setCurrentUserId(null);
      setCurrentUserEmail(null);
      resetAuthForm();
      setFavorites({});
      setDishAssociations([]);
      rememberedHomeFeed = null;
      router.replace({
        pathname: '/',
        params: {
          refresh: String(Date.now()),
          headerSync: String(Date.now()),
          guestMode: '1',
        },
      });
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user?.id) {
        setDebugStage('guest:signout-existing-session');
        await clearUserSessionArtifacts(sessionData.session.user.id, sessionData.session.user.email ?? null);
        await supabase.auth.signOut({ scope: 'local' });
      }
      console.info('[guest-mode] activating guest mode');
      setShowSignup(false);
      setSessionChecked(true);
      setDebugStage('guest:load-dishes');
      await loadDishAssociations({ showLoading: false, guestModeOverride: true });
    } catch (error) {
      setDebugStage('guest:activate-error');
      console.warn('[guest-mode] activation failed', error);
      await setGuestModeEnabled(false);
      setIsGuestMode(false);
      setIsAuthenticated(false);
      setCurrentUserId(null);
      setCurrentUserEmail(null);
      setDishAssociations([]);
      setFavorites({});
      setHasLoaded(true);
      setAuthError(t('authGenericError'));
      setSessionChecked(true);
      setLoading(false);
    } finally {
      guestActivationInFlightRef.current = false;
      setAuthLoading(false);
    }
  }, [loadDishAssociations, resetAuthForm, t]);

  const showGuestLoginDialog = useCallback(() => {
    showAppDialog({
      title: t('authGuestActionTitle'),
      message: t('authGuestUploadMessage'),
      actions: [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('headerMenuSignIn'),
          onPress: () => {
            void openLoginFromGuest();
          },
        },
      ],
    });
  }, [openLoginFromGuest, t]);


  const signIn = async () => {
    Keyboard.dismiss();
    setDebugStage('signin:start');
    if (!email.trim() || !pass.trim()) {
      setDebugStage('signin:validation-error');
      setAuthError(t('authEnterEmailPassword'));
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });
      if (error) {
        throw error;
      }
      const sessionUser = data.session?.user ?? data.user ?? null;
      setDebugStage('signin:success');
      await setGuestModeEnabled(false);
      authBootstrapUserIdRef.current = sessionUser?.id ?? null;
      setAuthHydrating(Boolean(sessionUser));
      setSessionChecked(true);
      setForceLoggedOut(false);
      setIsGuestMode(false);
      setIsAuthenticated(Boolean(sessionUser));
      setCurrentUserId(sessionUser?.id ?? null);
      setCurrentUserEmail(sessionUser?.email ?? null);
      setPendingLocalLogout(false);
      setPendingLocalLogoutState(false);
      setError(null);
      setHasLoaded(false);
      setLoading(false);
      setIsRefreshing(false);
      setDishAssociations([]);
      setFavorites({});
      rememberedHomeFeed = null;
      setShowSignup(false);
      if (sessionUser?.id) {
        await waitForStableSessionUser(sessionUser.id);
        await hydrateSignedInHome(
          sessionUser.id,
          sessionUser.email ?? null,
          data.session?.access_token ?? null
        );
      }
    } catch (err) {
      setAuthHydrating(false);
      setDebugStage('signin:error');
      const message = err instanceof Error ? err.message : t('authLoginFailed');
      setAuthError(toLocalizedAuthError(message));
    } finally {
      authBootstrapUserIdRef.current = null;
      setAuthLoading(false);
    }
  };

  const signUp = async () => {
    Keyboard.dismiss();
    setDebugStage('signup:start');
    if (!email.trim() || !pass.trim() || !confirmPass.trim()) {
      setDebugStage('signup:validation-error');
      setAuthError(t('authEnterEmailPasswordConfirm'));
      return;
    }
    if (!acceptedTerms) {
      setAuthError(t('authMustAcceptTerms'));
      return;
    }
    if (pass !== confirmPass) {
      setAuthError(t('authPasswordsMismatch'));
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const domainPart = trimmedEmail.includes('@')
      ? trimmedEmail.split('@').pop()?.trim().toLowerCase() ?? ''
      : '';
    if (!domainPart) {
      setAuthError(t('authEmailDomainMissing'));
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const { data: companyMatch, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .ilike('domain', domainPart)
        .limit(1)
        .maybeSingle();
      if (companyError) {
        throw companyError;
      }
      if (!companyMatch?.id) {
        setAuthError(t('authEmailDomainUnknown'));
        return;
      }
      const { data: existingByEmail, error: existingByEmailError } = await supabase
        .from('AppUsers')
        .select('user_id, email')
        .ilike('email', trimmedEmail)
        .limit(1)
        .maybeSingle();
      if (existingByEmailError) {
        throw existingByEmailError;
      }
      if (existingByEmail?.email) {
        setAuthError(t('authUserExists'));
        return;
      }
      const redirectTo = buildAuthRedirectUrl(locale);
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
        options: {
          emailRedirectTo: redirectTo,
          data: { preferred_locale: locale },
        },
      });
      if (error) {
        throw error;
      }
      const signupLooksLikeExistingUser =
        !data.session &&
        Boolean(data.user) &&
        Array.isArray((data.user as { identities?: unknown[] }).identities) &&
        ((data.user as { identities?: unknown[] }).identities?.length ?? 0) === 0;
      if (signupLooksLikeExistingUser) {
        setAuthError(t('authUserExists'));
        return;
      }
      setDebugStage('signup:success');
      const supabaseUserId = data.user?.id;
      if (!data.user) {
        throw new Error(t('authSignupFailed'));
      }
      if (supabaseUserId && data.session) {
        await ensureAppUserProfile(supabaseUserId, trimmedEmail);
      }
      if (!data.session && data.user) {
        showAppDialog({
          title: t('authVerifyEmailSentTitle'),
          message: t('authVerifyEmailSentMessage'),
        });
      }
      await setGuestModeEnabled(false);
      setIsGuestMode(false);
      setPendingLocalLogout(false);
      setPendingLocalLogoutState(false);
      setShowSignup(false);
      setPass('');
      setConfirmPass('');
      setAcceptedTerms(false);
    } catch (err) {
      setDebugStage('signup:error');
      const authApiError =
        err && typeof err === 'object' && 'name' in err ? (err as { [k: string]: any }) : null;
      const message = authApiError?.message ?? (err instanceof Error ? err.message : t('authSignupFailed'));
      setAuthError(toLocalizedAuthError(message));
    } finally {
      setAuthLoading(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!email.trim()) {
      setAuthError(t('authResetEmailMissing'));
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: buildAuthRedirectUrl(locale),
      });
      if (error) {
        throw error;
      }
      showAppDialog({
        title: t('authResetEmailSentTitle'),
        message: t('authResetEmailSentMessage'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('authGenericError');
      setAuthError(toLocalizedAuthError(message));
    } finally {
      setAuthLoading(false);
    }
  };

  const showFavoritesOnly =
    typeof params.favorites === 'string' ? params.favorites === '1' : false;
  const restaurantFilterId =
    typeof params.restaurantId === 'string' && params.restaurantId.length > 0
      ? Number(params.restaurantId)
      : null;
  const restaurantFilterName =
    typeof params.restaurantName === 'string' ? params.restaurantName : null;
  const showRestaurantOnly =
    !showFavoritesOnly && (restaurantFilterId !== null || Boolean(restaurantFilterName));
  const shouldShowMainTabs = !showFavoritesOnly && !showRestaurantOnly;

  useEffect(() => {
    if (!shouldShowMainTabs && activeHomeTab !== 'dishes') {
      setActiveHomeTab('dishes');
    }
  }, [activeHomeTab, shouldShowMainTabs]);

  useEffect(() => {
    if (homeTabParam === 'restaurants' || homeTabParam === 'dishes') {
      setActiveHomeTab(homeTabParam);
      return;
    }
    if (shouldShowMainTabs) {
      setActiveHomeTab('dishes');
    }
  }, [homeTabParam, shouldShowMainTabs]);

  useEffect(() => {
    if (activeHomeTab === 'restaurants') {
      setHasVisitedRestaurantsTab(true);
    }
  }, [activeHomeTab]);

  useEffect(() => {
    return subscribeHomeTab((tab) => {
      setActiveHomeTab(tab);
    });
  }, []);

  const renderAssociations = getRenderableHomeAssociations({
    dishAssociations,
    favorites,
    showFavoritesOnly,
    showRestaurantOnly,
    restaurantFilterId,
    restaurantFilterName,
    isGuestMode,
    resolvedGlobalDishIds,
  });
  const hasHeaderContent = true;

  const groupedAssociations = useMemo<GroupedHomeAssociation[]>(
    () => groupHomeAssociations(renderAssociations, debouncedHomeSearch),
    [debouncedHomeSearch, renderAssociations]
  );

  const handleAvatarPress = useCallback((url: string | null, label: string | null) => {
    setAvatarPreviewUrl(url);
    setAvatarPreviewLabel(label);
    setAvatarPreviewOpen(true);
  }, []);

  const handlePreviewImage = useCallback((dish: DishAssociation) => {
    setImagePreview({
      imageUrl: dish.image_url ?? null,
      title: dish.dish_name ?? null,
      subtitle: dish.restaurant_name ?? null,
    });
  }, []);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      toggleFavorite(id);
    },
    [toggleFavorite]
  );

  const handleOpenDish = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/dish',
        params: {
          dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
          dishName: dish.dish_name ?? '',
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
        },
      });
    },
    [router]
  );

  const handleOpenRestaurant = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/restaurant',
        params: {
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
        },
      });
    },
    [router]
  );

  const handleHomeSearchSubmit = useCallback(() => {
    const normalizedNeedle = normalizeHomeSearchNeedle(homeSearch);
    if (!normalizedNeedle) return;

    const matchingDishGroups = groupedAssociations.filter((group) => {
      const dishName = normalizeHomeSearchNeedle(group.dishName ?? '');
      return dishName.includes(normalizedNeedle);
    });

    if (matchingDishGroups.length === 1 && matchingDishGroups[0].items.length > 0) {
      handleOpenDish(matchingDishGroups[0].items[0]);
      return;
    }

    const matchingRestaurants = renderAssociations.filter((dish) => {
      const restaurantName = normalizeHomeSearchNeedle(dish.restaurant_name ?? '');
      return restaurantName.includes(normalizedNeedle);
    });

    if (matchingRestaurants.length > 0 && shouldShowMainTabs) {
      publishHomeTab('restaurants');
      setActiveHomeTab('restaurants');
    }
  }, [groupedAssociations, handleOpenDish, homeSearch, renderAssociations, shouldShowMainTabs]);

  const listHeader = (
    <HomeFeedHeader
      isRTL={isRTL}
      t={t}
      showRestaurantOnly={showRestaurantOnly}
      showFavoritesOnly={showFavoritesOnly}
      restaurantFilterName={restaurantFilterName}
      loading={loading}
      hasLoaded={hasLoaded}
      hasFeedItems={dishAssociations.length > 0}
      isRefreshing={isRefreshing}
      error={error}
      homeSearch={homeSearch}
      shouldShowMainTabs={shouldShowMainTabs}
      activeHomeTab={activeHomeTab}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onHomeSearchChange={setHomeSearch}
      onHomeSearchSubmit={handleHomeSearchSubmit}
      onHomeSearchClear={() => setHomeSearch('')}
      onSetActiveHomeTab={setActiveHomeTab}
    />
  );

  const handleOpenCamera = useCallback(
    (dish: DishAssociation) => {
      if (!isAuthenticated && isGuestMode) {
        showGuestLoginDialog();
        return;
      }
      router.push({
        pathname: '/camera',
        params: {
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
          dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
          dishName: dish.dish_name ?? '',
          lockSelection: '1',
        },
      });
    },
    [isAuthenticated, isGuestMode, router, showGuestLoginDialog]
  );

  const handleEdit = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/edit-dish',
        params: { id: dish.id, returnTo: 'main', scrollY: String(scrollYRef.current) },
      });
    },
    [router]
  );

  const handleOrder = useCallback(
    (dish: DishAssociation) => {
      if (!isAuthenticated && isGuestMode) {
        showGuestLoginDialog();
        return;
      }
      openVendorDish(orderVendor, dish.restaurant_id, dish.dish_id);
    },
    [isAuthenticated, isGuestMode, orderVendor, showGuestLoginDialog]
  );

  const renderDishGroup = useCallback(
    ({ item, index }: { item: { key: string; items: DishAssociation[] }; index: number }) => (
      <StaggeredEntrance index={index}>
        <DishCard
          items={item.items}
          favorites={favorites}
          currentUserId={currentUserId}
          avatarUrl={avatarUrl}
          userAvatars={userAvatars}
          userLabels={userLabels}
          onAvatarPress={handleAvatarPress}
          onToggleFavorite={handleToggleFavorite}
          onOpenPhoto={handleOpenDish}
          onPreviewImage={handlePreviewImage}
          onOpenDish={handleOpenDish}
          onOpenRestaurant={handleOpenRestaurant}
          onDelete={deleteDishAssociation}
          onOpenCamera={handleOpenCamera}
          onEdit={handleEdit}
          onOrder={handleOrder}
        />
      </StaggeredEntrance>
    ),
    [
      avatarUrl,
      currentUserId,
      deleteDishAssociation,
      favorites,
      handleAvatarPress,
      handleEdit,
      handleOpenCamera,
      handleOpenDish,
      handleOpenRestaurant,
      handlePreviewImage,
      handleToggleFavorite,
      handleOrder,
      userAvatars,
      userLabels,
    ]
  );

  const compactStartupDebugLines = useMemo(
    () =>
      startupDebugLines.filter((line) => {
        return (
          line.startsWith('boot.step=') ||
          line.startsWith('boot.start=') ||
          line.startsWith('boot.domain=') ||
          line.startsWith('boot.companyIdDomain=') ||
          line.startsWith('boot.feed=') ||
          line.startsWith('boot.done=') ||
          line.startsWith('boot.recovery=') ||
          line.startsWith('boot.recoveryCompanyId=') ||
          line.startsWith('boot.recoveryError=') ||
          line.startsWith('render.auth=') ||
          line.startsWith('render.authHydrating=') ||
          line.startsWith('render.loading=') ||
          line.startsWith('render.hasLoaded=') ||
          line.startsWith('render.dishes=') ||
          line.startsWith('render.error=')
        );
      }),
    [startupDebugLines]
  );

  const openHomeHeaderMenu = useCallback(() => {
    setHomeHeaderMenuOpenKey((value) => value + 1);
    setHomeHeaderMenuVisible(true);
  }, []);

  const goHomeFromHeader = useCallback(() => {
    const isHomeRouteWithoutFilters =
      !showFavoritesOnly &&
      !showRestaurantOnly;
    const isPlainHomeRoute =
      isHomeRouteWithoutFilters &&
      activeHomeTab === 'dishes' &&
      !homeSearch.trim();

    publishHomeTab('dishes');
    setActiveHomeTab('dishes');
    setHomeSearch('');
    setDebouncedHomeSearch('');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    scrollYRef.current = 0;

    if (isPlainHomeRoute) {
      return;
    }

    // When we're already on the root home route, switching back to the dishes tab
    // should stay in-place instead of forcing a route replacement. The extra
    // replace() is the most likely release-only crash trigger from restaurants.
    if (isHomeRouteWithoutFilters) {
      return;
    }

    router.replace({
      pathname: '/',
      params: {
        refresh: String(Date.now()),
        headerSync: String(Date.now()),
        guestMode: isGuestMode ? '1' : '0',
        homeTab: 'dishes',
      },
    });
  }, [activeHomeTab, homeSearch, isGuestMode, router, showFavoritesOnly, showRestaurantOnly]);

  return (
    <SafeAreaView
      style={[styles.container, !isAuthenticated && !isGuestMode && styles.containerAuth]}
      edges={['left', 'right', 'bottom']}
    >
      <AppHeader
        companyLogoUrlOverride={companyLogoUrl}
        companyLogoPathOverride={companyLogoPath}
        debugStageOverride={debugStage}
        isAuthenticatedOverride={isAuthenticated}
        isGuestModeOverride={isGuestMode}
        currentUserIdOverride={currentUserId}
        currentUserEmailOverride={currentUserEmail}
        forceMenuOpenKey={homeHeaderMenuOpenKey}
        externalTouchHandling
        menuVisibleOverride={homeHeaderMenuVisible}
        onMenuVisibleChange={setHomeHeaderMenuVisible}
      />
      <View style={styles.screenBody}>
      {!sessionChecked && skipLaunchParam !== '1' && !forceLoggedOut ? (
        <View style={styles.launchScreen}>
          <View style={styles.launchCard}>
            <Text style={styles.launchTitle}>DishGuru</Text>
            <Text style={styles.launchSubtitle}>{t('launchSubtitle')}</Text>
            <ActivityIndicator size="small" color={theme.colors.accent} style={styles.launchSpinner} />
          </View>
        </View>
      ) : (forceLoggedOut || pendingLocalLogout || (!isAuthenticated && !isGuestMode)) && !isAuthenticated ? (
        <HomeAuthView
          isRTL={isRTL}
          locale={locale}
          t={t}
          email={email}
          pass={pass}
          confirmPass={confirmPass}
          showSignup={showSignup}
          acceptedTerms={acceptedTerms}
          showPass={showPass}
          showConfirmPass={showConfirmPass}
          authError={authError}
          authLoading={authLoading}
          onLocaleChange={setLocale}
          onEmailChange={setEmail}
          onPassChange={setPass}
          onConfirmPassChange={setConfirmPass}
          onToggleShowPass={() => setShowPass((v) => !v)}
          onToggleShowConfirmPass={() => setShowConfirmPass((v) => !v)}
          onToggleAcceptedTerms={() => setAcceptedTerms((value) => !value)}
          onOpenTerms={() =>
            setLegalModal({
              title: t('legalTermsTitle'),
              url: getLegalUrl(locale, 'terms'),
            })
          }
          onForgotPassword={() => void sendPasswordReset()}
          onSignIn={signIn}
          onSignUp={signUp}
          onShowSignup={() => {
            setShowSignup(true);
            setAuthError(null);
          }}
          onBackToSignIn={() => {
            setShowSignup(false);
            setAcceptedTerms(false);
            setAuthError(null);
          }}
          onBrowseGuest={() => {
            void activateGuestMode();
          }}
        />
      ) : (
        <View style={styles.tabScene}>
          <View
            style={[
              styles.tabPane,
              activeHomeTab === 'dishes' ? styles.tabPaneVisible : styles.tabPaneHidden,
            ]}
            pointerEvents={activeHomeTab === 'dishes' ? 'auto' : 'none'}
          >
            <FlatList
              ref={listRef}
              data={groupedAssociations}
              keyExtractor={(item) => item.key}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              updateCellsBatchingPeriod={40}
              windowSize={5}
              removeClippedSubviews
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.feedContent,
                !hasHeaderContent && styles.feedContentNoHeader,
              ]}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={() => refreshContent({ force: true, showSpinner: true })}
                  tintColor={theme.colors.accent}
                  colors={[theme.colors.accent]}
                />
              }
              onScroll={(event) => {
                const y = event.nativeEvent.contentOffset.y;
                scrollYRef.current = y;
              }}
              scrollEventThrottle={32}
              ListHeaderComponent={listHeader}
              ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
              ListEmptyComponent={
                !loading && !error && hasLoaded ? (
                  <View style={styles.results}>
                    <Text style={[styles.placeholderText, !isRTL && styles.placeholderTextLtr]}>
                      {showFavoritesOnly ? t('favoritesEmpty') : t('commonNoDishesToShow')}
                    </Text>
                  </View>
                ) : null
              }
              renderItem={renderDishGroup}
            />
          </View>
          {(activeHomeTab === 'restaurants' || hasVisitedRestaurantsTab) ? (
            <View
              style={[
                styles.tabPane,
                activeHomeTab === 'restaurants' ? styles.tabPaneVisible : styles.tabPaneHidden,
              ]}
              pointerEvents={activeHomeTab === 'restaurants' ? 'auto' : 'none'}
            >
              <RestaurantsTab
                dishes={dishAssociations}
                loading={loading}
                hasLoaded={hasLoaded}
                error={error}
                canAddDish={isAuthenticated}
                onRequireLogin={showGuestLoginDialog}
                searchQuery={debouncedHomeSearch}
                listHeader={listHeader}
                isRefreshing={isRefreshing}
                onRefresh={() => refreshContent({ force: true, showSpinner: true })}
              />
            </View>
          ) : null}
        </View>
      )}
      {(isAuthenticated || isGuestMode) && (
        <>
          <Animated.View style={styles.fabWrapAnimated}>
            <Animated.View style={{ transform: [{ scale: fabPulse }] }}>
              <Pressable
                style={({ pressed }) => [styles.fabButton, pressed && styles.fabButtonPressed]}
                onPress={() => {
                  if (!isAuthenticated && isGuestMode) {
                    showGuestLoginDialog();
                    return;
                  }
                  router.push('/camera');
                }}
              >
                <Ionicons name="camera" size={38} color={theme.colors.white} />
              </Pressable>
            </Animated.View>
          </Animated.View>
        </>
      )}
      <AvatarPreviewModal
        visible={avatarPreviewOpen}
        avatarUrl={avatarPreviewUrl}
        label={avatarPreviewLabel}
        onClose={() => {
          setAvatarPreviewOpen(false);
          setAvatarPreviewUrl(null);
          setAvatarPreviewLabel(null);
        }}
      />
      <ImagePreviewModal
        visible={Boolean(imagePreview?.imageUrl)}
        imageUrl={imagePreview?.imageUrl ?? null}
        title={imagePreview?.title ?? null}
        subtitle={imagePreview?.subtitle ?? null}
        onClose={() => setImagePreview(null)}
      />
      <LegalModal
        visible={Boolean(legalModal)}
        title={legalModal?.title ?? ''}
        url={legalModal?.url ?? getLegalUrl(locale, 'terms')}
        onClose={() => setLegalModal(null)}
      />
      {isAuthenticated && loading && !hasLoaded ? (
        <View style={styles.startupDebugCard}>
          {compactStartupDebugLines.map((line) => (
            <Text key={line} style={styles.startupDebugText}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      </View>
      {(isAuthenticated || isGuestMode) ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.homeHeaderTouchOverlay,
            { top: 0, height: insets.top + 64 },
          ]}
        >
          <View style={[styles.homeHeaderTouchRow, { paddingTop: insets.top + 6 }]}>
            <View style={styles.homeHeaderTouchEdge}>
              {isRTL ? (
                <Pressable
                  style={styles.homeHeaderTouchButton}
                  hitSlop={20}
                  onPress={() => router.push('/search')}
                />
              ) : (
                <Pressable
                  style={styles.homeHeaderTouchButton}
                  hitSlop={20}
                  onPress={openHomeHeaderMenu}
                />
              )}
            </View>
            <Pressable
              style={styles.homeHeaderTouchCenter}
              hitSlop={20}
              onPress={goHomeFromHeader}
            />
            <View style={styles.homeHeaderTouchEdge}>
              {isRTL ? (
                <Pressable
                  style={styles.homeHeaderTouchButton}
                  hitSlop={20}
                  onPress={openHomeHeaderMenu}
                />
              ) : (
                <Pressable
                  style={styles.homeHeaderTouchButton}
                  hitSlop={20}
                  onPress={() => router.push('/search')}
                />
              )}
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
  },
  containerAuth: {
    backgroundColor: theme.colors.background,
  },
  screenBody: {
    flex: 1,
  },
  homeHeaderTouchOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  homeHeaderTouchRow: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  homeHeaderTouchEdge: {
    width: 56,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeHeaderTouchCenter: {
    flex: 1,
    minHeight: 48,
    marginHorizontal: 8,
  },
  homeHeaderTouchButton: {
    width: 44,
    height: 44,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: 12,
    marginTop: 6,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 96,
  },
  rightIcons: {
    width: 96,
    alignItems: 'flex-end',
  },
  iconButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  logoImage: {
    width: 160,
    height: 40,
    resizeMode: 'contain',
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuOverlay: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4,
  },
  menuOption: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  signOutMenuButton: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  signOutMenuText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  menuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  menuOptionRow: {
    paddingVertical: 4,
  },
  results: {
    alignSelf: 'stretch',
    flex: 1,
    padding: 12,
    backgroundColor: 'transparent',
  },
  authScreen: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
    gap: 8,
    paddingTop: 72,
    paddingBottom: 28,
  },
  authKeyboardAvoiding: {
    flex: 1,
  },
  authScroll: {
    flex: 1,
  },
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  authLanguageRow: {
    width: '100%',
    maxWidth: 580,
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  authLanguageRowLtr: {
    flexDirection: 'row',
  },
  authLanguageChip: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authLanguageChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  authLanguageChipText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.semibold,
  },
  authLanguageChipTextActive: {
    color: theme.colors.accent,
  },
  authHeaderWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 12,
    marginTop: 18,
    marginBottom: 28,
  },
  authTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    fontFamily: 'Heebo_700Bold',
    lineHeight: 40,
  },
  authCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 16,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    width: '100%',
    maxWidth: 580,
  },
  fieldGroup: {
    gap: 9,
  },
  fieldLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'flex-end',
    paddingRight: 4,
    fontFamily: theme.typography.semibold,
  },
  fieldLabelLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
    paddingRight: 0,
    paddingLeft: 4,
  },
  inputRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.cardAlt,
  },
  inputIcon: {
    display: 'none',
    width: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputField: {
    flex: 1,
    fontSize: 16,
    textAlign: 'left',
    color: theme.colors.text,
    writingDirection: 'ltr',
    paddingLeft: 4,
    paddingRight: 4,
  },
  inputFieldPassword: {
    flex: 1,
    fontSize: 16,
    textAlign: 'left',
    color: theme.colors.text,
    writingDirection: 'ltr',
    paddingLeft: 4,
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 10,
    top: 7,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    zIndex: 2,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: theme.colors.danger,
    textAlign: 'right',
    marginTop: -2,
  },
  forgotPasswordTextLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  termsRow: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  termsRowLtr: {
    flexDirection: 'row',
  },
  termsRowPressed: {
    opacity: 0.92,
  },
  termsTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  termsTextWrapLtr: {
    alignItems: 'flex-start',
  },
  termsCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  termsCheckboxChecked: {
    backgroundColor: theme.colors.accent,
  },
  termsText: {
    color: theme.colors.text,
    textAlign: 'right',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  termsTextLtr: {
    textAlign: 'left',
  },
  authErrorText: {
    color: theme.colors.danger,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  authErrorTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  loginButton: {
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  signupButton: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  guestButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  guestButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontFamily: theme.typography.semibold,
  },
  guestHintText: {
    marginTop: 10,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  guestHintTextLtr: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  listContent: {
    paddingBottom: 160,
    gap: 10,
  },
  feedContent: {
    paddingBottom: 120,
  },
  feedContentNoHeader: {
    paddingTop: 16,
  },
  listHeader: {
    gap: 0,
    paddingTop: 15,
    paddingBottom: 15,
  },
  tabsSection: {
    marginTop: 12,
  },
  tabsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  tabsRowLtr: {
    flexDirection: 'row',
  },
  tabChip: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tabChipInner: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  tabChipText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.semibold,
  },
  tabChipTextActive: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
  },
  tabUnderline: {
    width: '88%',
    height: 2,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: theme.colors.accent,
  },
  tabsDivider: {
    marginTop: -1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardSeparator: {
    height: 16,
  },
  homeSearchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 0,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#F3F3F3',
    alignSelf: 'center',
    width: '82%',
    marginTop: 0,
    marginBottom: 0,
  },
  homeSearchBoxLtr: {
    flexDirection: 'row',
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
    textAlign: 'right',
  },
  homeSearchClear: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: theme.colors.white,
  },
  restaurantsTabScrollContent: {
    paddingBottom: 140,
  },
  tabScene: {
    flex: 1,
  },
  tabPane: {
    flex: 1,
  },
  tabPaneVisible: {
    flex: 1,
    opacity: 1,
  },
  tabPaneHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  fabWrapAnimated: {
    position: 'absolute',
    right: 18,
    bottom: 94,
  },
  fabButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: primaryActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  startupDebugCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 120,
    backgroundColor: 'rgba(32, 18, 12, 0.92)',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    zIndex: 40,
  },
  startupDebugText: {
    color: '#FFF7F0',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'left',
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 0,
  },
  favoritesHeaderLtr: {
    flexDirection: 'row-reverse',
  },
  favoritesHeaderText: {
    fontSize: 18,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  favoritesHeaderTextLtr: {
    textAlign: 'left',
    marginRight: 0,
    marginLeft: 8,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 2,
  },
  dishTitle: {
    display: 'none',
  },
  restaurantText: {
    display: 'none',
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'right',
  },
  placeholderTextLtr: {
    textAlign: 'left',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  launchScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  launchCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 28,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  launchTitle: {
    fontSize: 34,
    fontFamily: 'Heebo_700Bold',
    color: theme.colors.text,
    textAlign: 'center',
  },
  launchSubtitle: {
    marginTop: 10,
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    fontFamily: theme.typography.medium,
  },
  launchSpinner: {
    marginTop: 18,
  },
  domainCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  domainLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: theme.typography.semibold,
  },
  domainValue: {
    fontSize: 16,
    fontFamily: theme.typography.semibold,
    color: theme.colors.text,
    marginBottom: 8,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: theme.typography.semibold,
    color: theme.colors.text,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.text,
    fontFamily: theme.typography.medium,
  },
  cardSubtitleMuted: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.medium,
  },
  editBadge: {
    position: 'absolute',
    top: 144,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 20,
  },
});
