import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { getCurrentAuthUser, SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabase';
import {
  cacheScopedLogo,
  getSessionCompanyLogoSnapshot,
  getLogoCacheScope,
  loadSessionCompanyLogo,
  loadCachedLogo,
  resolveLogoUrl,
  subscribeSessionCompanyLogo,
} from '../lib/logo';
import { cacheAvatar, hydrateAvatarForUser } from '../lib/avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LegalModal from './LegalModal';
import CachedLogo from './CachedLogo';
import DefaultAvatar from './DefaultAvatar';
import { theme } from '../lib/theme';
import { applyPaletteFromLogo } from '../lib/brandPalette';
import { getLegalUrl, useLocale } from '../lib/locale';
import { fetchDishDraftCount, fetchGlobalCompanyContext } from '../lib/appData';
import { loadGuestMode, setGuestModeEnabled } from '../lib/guestMode';
import { publishHomeTab } from '../lib/homeTabs';
import { showAppAlert } from '../lib/appDialog';
import { subscribeAvatarUpdates } from '../lib/avatarEvents';
import { setPendingLocalLogout } from '../lib/logoutGate';
import { clearUserSessionArtifacts } from '../lib/sessionCleanup';

let lastKnownCompanyLogoUrl: string | null = null;
const guestHeaderIcon = require('../assets/images/guest-header-icon.png');

const getSessionAvatarUrl = (session: any) =>
  ((session?.user?.user_metadata as any)?.avatar_url as string | null | undefined) ?? null;

type AppHeaderProps = {
  companyLogoUrlOverride?: string | null;
  companyLogoPathOverride?: string | null;
  isAuthenticatedOverride?: boolean;
  isGuestModeOverride?: boolean;
  currentUserIdOverride?: string | null;
  currentUserEmailOverride?: string | null;
  forceMenuOpenKey?: number;
  externalTouchHandling?: boolean;
  menuVisibleOverride?: boolean;
  onMenuVisibleChange?: (visible: boolean) => void;
};

export default function AppHeader({
  companyLogoUrlOverride,
  companyLogoPathOverride,
  isAuthenticatedOverride,
  isGuestModeOverride,
  currentUserIdOverride,
  currentUserEmailOverride,
  forceMenuOpenKey = 0,
  externalTouchHandling = false,
  menuVisibleOverride,
  onMenuVisibleChange,
}: AppHeaderProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const refreshParam =
    typeof globalParams.refresh === 'string' ? globalParams.refresh : '';
  const headerSyncParam =
    typeof globalParams.headerSync === 'string' ? globalParams.headerSync : '';
  const guestModeParam =
    typeof globalParams.guestMode === 'string' ? globalParams.guestMode : '';
  const skipLaunchParam =
    typeof globalParams.skipLaunch === 'string' ? globalParams.skipLaunch : '';
  const favoritesParam =
    typeof globalParams.favorites === 'string' ? globalParams.favorites : '';
  const restaurantIdParam =
    typeof globalParams.restaurantId === 'string' ? globalParams.restaurantId : '';
  const restaurantNameParam =
    typeof globalParams.restaurantName === 'string' ? globalParams.restaurantName : '';
  const insets = useSafeAreaInsets();
  const { isRTL, locale, t } = useLocale();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(lastKnownCompanyLogoUrl);
  const [menuVisible, setMenuVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [menuAvatarLoadFailed, setMenuAvatarLoadFailed] = useState(false);
  const [legalModal, setLegalModal] = useState<{ title: string; url: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [sessionLogo, setSessionLogo] = useState<ReturnType<typeof getSessionCompanyLogoSnapshot>>(
    getSessionCompanyLogoSnapshot()
  );
  const [resolvedSessionLogoUrl, setResolvedSessionLogoUrl] = useState<string | null>(null);
  const lastPaletteLogoRef = useRef<string | null>(null);
  const syncRunIdRef = useRef(0);
  const draftCountRequestIdRef = useRef(0);
  const isMenuControlled = typeof menuVisibleOverride === 'boolean';
  const resolvedMenuVisible = isMenuControlled ? menuVisibleOverride : menuVisible;

  const hasExternalAuthControl =
    typeof isAuthenticatedOverride === 'boolean' ||
    typeof isGuestModeOverride === 'boolean' ||
    typeof currentUserIdOverride !== 'undefined' ||
    typeof currentUserEmailOverride !== 'undefined';
  const effectiveIsAuthenticated =
    typeof isAuthenticatedOverride === 'boolean' ? isAuthenticatedOverride : isAuthenticated;
  const effectiveIsGuestMode =
    typeof isGuestModeOverride === 'boolean' ? isGuestModeOverride : isGuestMode;
  const effectiveCurrentUserId =
    typeof currentUserIdOverride !== 'undefined' ? currentUserIdOverride : currentUserId;
  const effectiveCurrentUserEmail =
    typeof currentUserEmailOverride !== 'undefined' ? currentUserEmailOverride : currentUserEmail;
  const shouldShowMenuAvatar = Boolean(avatarUrl && !menuAvatarLoadFailed);

  useEffect(() => {
    setMenuAvatarLoadFailed(false);
  }, [avatarUrl]);

  const loadPendingDraftCount = useCallback(async (userId: string | null) => {
    const requestId = ++draftCountRequestIdRef.current;
    if (!userId) {
      setPendingDraftCount(0);
      return;
    }
    try {
      const nextCount = await fetchDishDraftCount(userId);
      if (draftCountRequestIdRef.current !== requestId) return;
      setPendingDraftCount(nextCount);
    } catch {
      if (draftCountRequestIdRef.current !== requestId) return;
      setPendingDraftCount(0);
    }
  }, []);

  const applyResolvedLogo = useCallback((url: string | null) => {
    setCompanyLogoUrl(url);
    lastKnownCompanyLogoUrl = url;
    if (url && lastPaletteLogoRef.current !== url) {
      lastPaletteLogoRef.current = url;
      applyPaletteFromLogo(url);
    }
    if (!url) {
      lastPaletteLogoRef.current = null;
      applyPaletteFromLogo(null);
    }
  }, []);

  useEffect(() => {
    const applySessionLogo = (logo: ReturnType<typeof getSessionCompanyLogoSnapshot>) => {
      setSessionLogo(logo);
      setResolvedSessionLogoUrl(logo?.logoUrl ?? null);
    };

    applySessionLogo(getSessionCompanyLogoSnapshot());
    return subscribeSessionCompanyLogo(applySessionLogo);
  }, [applyResolvedLogo]);

  useEffect(() => {
    let cancelled = false;

    if (!effectiveCurrentUserId) {
      setSessionLogo(null);
      setResolvedSessionLogoUrl(null);
      return;
    }

    const hydrateSessionLogo = async () => {
      const snapshot = getSessionCompanyLogoSnapshot();
      if (snapshot?.logoUrl && !cancelled) {
        setSessionLogo(snapshot);
        setResolvedSessionLogoUrl(snapshot.logoUrl);
        return;
      }

      const resolved = await loadSessionCompanyLogo(effectiveCurrentUserId, effectiveCurrentUserEmail, {
        forceRefresh: true,
      });
      if (!cancelled) {
        setSessionLogo(resolved);
        setResolvedSessionLogoUrl(resolved.logoUrl ?? null);
      }
    };

    hydrateSessionLogo().catch(() => {
      if (!cancelled) {
        setSessionLogo(null);
        setResolvedSessionLogoUrl(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveCurrentUserEmail, effectiveCurrentUserId]);

  useEffect(() => {
    if (skipLaunchParam === '1') {
      return;
    }

    if (effectiveCurrentUserId || effectiveIsAuthenticated || effectiveIsGuestMode) {
      setIsLoggingOut(false);
    }
  }, [
    effectiveCurrentUserId,
    effectiveIsAuthenticated,
    effectiveIsGuestMode,
    skipLaunchParam,
  ]);

  useEffect(() => {
    const activeLogoUrl = sessionLogo?.logoUrl ?? null;
    if (activeLogoUrl && lastPaletteLogoRef.current !== activeLogoUrl) {
      lastPaletteLogoRef.current = activeLogoUrl;
      applyPaletteFromLogo(activeLogoUrl);
    }
    if (!activeLogoUrl && !companyLogoUrl) {
      lastPaletteLogoRef.current = null;
      applyPaletteFromLogo(null);
    }
  }, [companyLogoUrl, sessionLogo?.logoUrl]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [companyLogoUrl, sessionLogo?.logoUrl]);

  const syncHeaderState = useCallback(async (sessionOverride?: any, options?: {
    useCachedAssets?: boolean;
  }) => {
    const runId = ++syncRunIdRef.current;
    const isCurrentRun = () => syncRunIdRef.current === runId;
    const session =
      sessionOverride ?? (await supabase.auth.getSession()).data.session;
    if (!isCurrentRun()) return;
    const userId = session?.user?.id ?? null;
    const guestModeEnabled = !userId ? await loadGuestMode() : false;
    if (!isCurrentRun()) return;
    const sessionEmail = session?.user?.email ?? null;
    const logoCacheScope = getLogoCacheScope(userId, sessionEmail, guestModeEnabled);

    if (userId || guestModeEnabled) {
      setIsLoggingOut(false);
      setPendingLocalLogout(false);
    }
    setIsGuestMode(guestModeEnabled);
    setIsAuthenticated(Boolean(userId));
    setCurrentUserId(userId);
    setCurrentUserEmail(sessionEmail);

    if (options?.useCachedAssets) {
      const [cached] = await Promise.all([
        loadCachedLogo(logoCacheScope),
      ]);
      if (!isCurrentRun()) return;
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        applyResolvedLogo(resolved);
      }
    }

    const metaAvatar = getSessionAvatarUrl(session);
    const resolvedAvatar = await hydrateAvatarForUser(userId, metaAvatar);
    if (!isCurrentRun()) return;
    if (resolvedAvatar) {
      setAvatarUrl(resolvedAvatar);
      await cacheAvatar(userId, resolvedAvatar);
    } else if (!userId) {
      setAvatarUrl(null);
      await cacheAvatar(null, null);
    } else {
      setAvatarUrl(null);
      await cacheAvatar(userId, null);
    }

    if (userId) {
      let resolvedLogo =
        getSessionCompanyLogoSnapshot() ?? (await loadSessionCompanyLogo(userId, sessionEmail));
      if (!isCurrentRun()) return;
      if (!resolvedLogo.logoUrl) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        resolvedLogo = await loadSessionCompanyLogo(userId, sessionEmail, { forceRefresh: true });
        if (!isCurrentRun()) return;
      }
      if (resolvedLogo.logoUrl) {
        setSessionLogo(resolvedLogo);
        setResolvedSessionLogoUrl(resolvedLogo.logoUrl);
      } else if (!lastKnownCompanyLogoUrl) {
        setSessionLogo(resolvedLogo);
        setResolvedSessionLogoUrl(null);
      }
      return;
    }

    if (guestModeEnabled) {
      setSessionLogo(null);
      setResolvedSessionLogoUrl(null);
      const globalContext = await fetchGlobalCompanyContext();
      if (!isCurrentRun()) return;
      const resolved = resolveLogoUrl(globalContext?.logoUrl ?? null);
      applyResolvedLogo(resolved);
      await cacheScopedLogo({ logoUrl: resolved, logoPath: globalContext?.logoUrl ?? null }, logoCacheScope);
      return;
    }

    setSessionLogo(null);
    setResolvedSessionLogoUrl(null);
    applyResolvedLogo(null);
  }, [applyResolvedLogo]);

  useEffect(() => {
    if (pathname === '/' && skipLaunchParam === '1' && !currentUserId && !isAuthenticated) {
      setMenuVisible(false);
      setIsLoggingOut(true);
      setIsAuthenticated(false);
      setIsGuestMode(false);
      setCurrentUserId(null);
      setSessionLogo(null);
      setResolvedSessionLogoUrl(null);
      setAvatarUrl(null);
      applyResolvedLogo(null);
    }
  }, [applyResolvedLogo, currentUserId, isAuthenticated, pathname, skipLaunchParam]);

  useEffect(() => {
    if (hasExternalAuthControl) {
      return;
    }

    let mounted = true;
    const runSync = async () => {
      await syncHeaderState(undefined, { useCachedAssets: true });
    };

    runSync().catch(() => {
      if (mounted) {
        applyResolvedLogo(null);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      try {
        await syncHeaderState(session);
      } catch (headerSyncError) {
        if (mounted) {
          console.warn('[header] auth state sync failed', headerSyncError);
          applyResolvedLogo(null);
        }
      }
    });

    return () => {
      mounted = false;
      syncRunIdRef.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, [
    applyResolvedLogo,
    guestModeParam,
    hasExternalAuthControl,
    headerSyncParam,
    refreshParam,
    skipLaunchParam,
    syncHeaderState,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!hasExternalAuthControl) {
      return () => {
        cancelled = true;
      };
    }

    if (!effectiveCurrentUserId) {
      setAvatarUrl(null);
      return () => {
        cancelled = true;
      };
    }

    const hydrateControlledAvatar = async () => {
      const authUser = await getCurrentAuthUser().catch(() => null);
      const resolvedAvatar = await hydrateAvatarForUser(
        effectiveCurrentUserId,
        (authUser?.user_metadata as any)?.avatar_url ?? null
      );
      if (!cancelled) {
        setAvatarUrl(resolvedAvatar);
      }
    };

    void hydrateControlledAvatar();

    return () => {
      cancelled = true;
    };
  }, [effectiveCurrentUserId, hasExternalAuthControl]);

  useEffect(() => {
    return subscribeAvatarUpdates(({ userId, avatarUrl: nextAvatarUrl }) => {
      if (!effectiveCurrentUserId || userId !== effectiveCurrentUserId) return;
      setAvatarUrl(nextAvatarUrl);
    });
  }, [effectiveCurrentUserId]);

  useEffect(() => {
    if (!forceMenuOpenKey) return;
    if (isMenuControlled) {
      onMenuVisibleChange?.(true);
      return;
    }
    setMenuVisible(true);
  }, [forceMenuOpenKey, isMenuControlled, onMenuVisibleChange]);

  const setResolvedMenuVisible = useCallback(
    (visible: boolean) => {
      if (isMenuControlled) {
        onMenuVisibleChange?.(visible);
        return;
      }
      setMenuVisible(visible);
    },
    [isMenuControlled, onMenuVisibleChange]
  );

  const signOut = async () => {
    setPendingLocalLogout(true);
    setResolvedMenuVisible(false);
    setIsLoggingOut(true);
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setCurrentUserId(null);
    setSessionLogo(null);
    setResolvedSessionLogoUrl(null);
    setAvatarUrl(null);
    applyResolvedLogo(null);
    await clearUserSessionArtifacts(effectiveCurrentUserId, effectiveCurrentUserEmail);
    await setGuestModeEnabled(false);
    await cacheAvatar(effectiveCurrentUserId, null);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      router.replace({
        pathname: '/',
        params: {
          headerSync: String(Date.now()),
          guestMode: '0',
          skipLaunch: '1',
        },
      });
    }
  };

  const goToLogin = async () => {
    setPendingLocalLogout(true);
    await clearUserSessionArtifacts(effectiveCurrentUserId, effectiveCurrentUserEmail);
    await setGuestModeEnabled(false);
    setIsGuestMode(false);
    setSessionLogo(null);
    setResolvedSessionLogoUrl(null);
    setResolvedMenuVisible(false);
    router.replace({
      pathname: '/',
      params: {
        headerSync: String(Date.now()),
        guestMode: '0',
        skipLaunch: '1',
      },
    });
  };

  const closeFeedback = () => {
    setFeedbackVisible(false);
    setFeedbackText('');
  };

  const sendFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed) {
      showAppAlert(t('feedbackTitle'), t('feedbackEmptyMessage'));
      return;
    }
    try {
      setFeedbackSending(true);
      const authUser = await getCurrentAuthUser().catch(() => null);
      const feedbackEmail =
        effectiveCurrentUserEmail ??
        authUser?.email ??
        null;
      const feedbackUserId =
        effectiveCurrentUserId ??
        authUser?.id ??
        null;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token?.trim() ?? '';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/send-feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            message: trimmed,
            email: feedbackEmail,
            locale,
            platform: Platform.OS,
            pathname,
            isGuestMode: effectiveIsGuestMode,
            userId: feedbackUserId,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      const rawResponse = await response.text();
      let parsedResponse: any = null;
      try {
        parsedResponse = rawResponse ? JSON.parse(rawResponse) : null;
      } catch {
        parsedResponse = rawResponse || null;
      }

      if (!response.ok) {
        const serverMessage =
          typeof parsedResponse?.error === 'string'
            ? parsedResponse.error
            : typeof parsedResponse === 'string'
              ? parsedResponse
              : '';
        throw new Error(serverMessage || `send-feedback failed (${response.status})`);
      }

      closeFeedback();
      showAppAlert(t('feedbackTitle'), t('feedbackSuccessMessage'));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      showAppAlert(
        t('feedbackTitle'),
        errorMessage
          ? `${t('feedbackSendFailedMessage')}\n\n${errorMessage}`
          : t('feedbackSendFailedMessage')
      );
    } finally {
      setFeedbackSending(false);
    }
  };

  const goHome = () => {
    setResolvedMenuVisible(false);
    const isPlainHomeRoute =
      pathname === '/' &&
      favoritesParam !== '1' &&
      !restaurantIdParam &&
      !restaurantNameParam;

    if (isPlainHomeRoute) {
      publishHomeTab('dishes');
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
  };

  const openMenu = () => {
    setResolvedMenuVisible(true);
  };

  const renderHeaderIconFrame = (iconName: 'menu' | 'search', size: number, showBadge = false) => (
    <View style={styles.headerIconWrap}>
      <View style={styles.iconButton}>
        <BlurView intensity={42} tint="light" style={styles.iconButtonBlur} />
        <View style={styles.iconButtonTint} />
        <Ionicons name={iconName} size={size} color={theme.colors.ink} />
      </View>
      {showBadge ? (
        <View style={styles.headerIconBadge}>
          <Text style={styles.headerIconBadgeText}>
            {pendingDraftCount > 9 ? '9+' : String(pendingDraftCount)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderMenuItem = (
    label: string,
    icon: React.ReactNode,
    onPress: () => void,
    options?: { badgeCount?: number }
  ) => (
    <Pressable
      style={[styles.menuOptionRow, !isRTL && styles.menuOptionRowLtr]}
      onPress={onPress}
    >
      {isRTL ? (
        <>
          <View style={styles.menuLabelWrap}>
            <Text style={[styles.menuOption, { textAlign: 'right' }]}>{label}</Text>
          </View>
          <View style={styles.menuIconWrap}>
            {icon}
            {options?.badgeCount && options.badgeCount > 0 ? (
              <View style={styles.menuCountBadgeOnIcon}>
                <Text style={styles.menuCountBadgeOnIconText}>
                  {options.badgeCount > 9 ? '9+' : String(options.badgeCount)}
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <View style={styles.menuIconWrap}>
            {icon}
            {options?.badgeCount && options.badgeCount > 0 ? (
              <View style={styles.menuCountBadgeOnIcon}>
                <Text style={styles.menuCountBadgeOnIconText}>
                  {options.badgeCount > 9 ? '9+' : String(options.badgeCount)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.menuLabelWrap, styles.menuLabelWrapLtr]}>
            <Text style={[styles.menuOption, { textAlign: 'left' }]}>{label}</Text>
          </View>
        </>
      )}
    </Pressable>
  );

  const hasSignedInSession = effectiveIsAuthenticated || Boolean(effectiveCurrentUserId);
  const isGuestHeader =
    !hasSignedInSession && (effectiveIsGuestMode || guestModeParam === '1');
  const shouldShowHeader = (!isLoggingOut || hasSignedInSession || isGuestHeader) && (hasSignedInSession || isGuestHeader);
  const shouldShowAuthenticatedMenu = hasSignedInSession;
  const sessionLogoSnapshot = getSessionCompanyLogoSnapshot();
  const normalizedOverrideLogoUrl = companyLogoPathOverride
    ? resolveLogoUrl(companyLogoPathOverride)
    : companyLogoUrlOverride
      ? resolveLogoUrl(companyLogoUrlOverride)
      : null;
  const effectiveCompanyLogoUrl = hasSignedInSession
    ? (
        normalizedOverrideLogoUrl ??
        resolvedSessionLogoUrl ??
        sessionLogo?.logoUrl ??
        sessionLogoSnapshot?.logoUrl ??
        companyLogoUrl ??
        null
      )
    : companyLogoUrl;
  const effectiveLogoDisplayUrl = effectiveCompanyLogoUrl;
  const shouldShowCompanyLogo = hasSignedInSession && Boolean(effectiveLogoDisplayUrl) && !logoLoadFailed;
  const shouldShowGuestHeaderIcon = isGuestHeader && !hasSignedInSession;
  const headerVisualKey = hasSignedInSession
    ? `auth:${effectiveCurrentUserId ?? 'anon'}:${effectiveCurrentUserEmail ?? ''}:${skipLaunchParam}`
    : isGuestHeader
      ? `guest:${guestModeParam || '0'}:${skipLaunchParam}`
      : `logged-out:${skipLaunchParam}`;

  useEffect(() => {
    void loadPendingDraftCount(effectiveCurrentUserId ?? null);
  }, [effectiveCurrentUserId, loadPendingDraftCount, pathname, refreshParam, headerSyncParam]);

  if (!shouldShowHeader) {
    return null;
  }

  return (
    <View
      key={headerVisualKey}
      style={[styles.header, { paddingTop: insets.top + 6 }]}
    >
      <View style={styles.leftIcons} pointerEvents="none">
        {!isRTL ? (
          renderHeaderIconFrame('menu', 28, shouldShowAuthenticatedMenu && pendingDraftCount > 0)
        ) : (
          renderHeaderIconFrame('search', 24)
        )}
      </View>
      <View
        style={styles.logoContainer}
        pointerEvents="none"
      >
        <Text
          style={[
            styles.logoText,
            (shouldShowCompanyLogo || shouldShowGuestHeaderIcon) && styles.logoTextHidden,
          ]}
        >
          DishGuru
        </Text>
        {shouldShowCompanyLogo ? (
          <CachedLogo
            uri={effectiveLogoDisplayUrl!}
            style={styles.logoImage}
            contentFit="contain"
            transition={0}
            priority="high"
            cachePolicy="memory-disk"
            onError={() => setLogoLoadFailed(true)}
          />
        ) : shouldShowGuestHeaderIcon ? (
          <View style={styles.guestHeaderIconFrame}>
            <Image source={guestHeaderIcon} style={styles.guestHeaderIcon} resizeMode="cover" />
          </View>
        ) : null}
      </View>
      <View style={styles.rightIcons} pointerEvents="none">
        {isRTL ? (
          renderHeaderIconFrame('menu', 28, shouldShowAuthenticatedMenu && pendingDraftCount > 0)
        ) : (
          renderHeaderIconFrame('search', 24)
        )}
      </View>
      {!externalTouchHandling ? (
        <View style={styles.headerTapLayer}>
          <View style={styles.leftIcons}>
            {!isRTL ? (
              <Pressable style={styles.iconButton} hitSlop={20} onPress={openMenu} />
            ) : (
              <Pressable style={styles.iconButton} hitSlop={20} onPress={() => router.push('/search')} />
            )}
          </View>
          <Pressable style={styles.logoTapTarget} hitSlop={20} onPress={goHome} />
          <View style={styles.rightIcons}>
            {isRTL ? (
              <Pressable style={styles.iconButton} hitSlop={20} onPress={openMenu} />
            ) : (
              <Pressable style={styles.iconButton} hitSlop={20} onPress={() => router.push('/search')} />
            )}
          </View>
        </View>
      ) : null}
      <Modal
        visible={resolvedMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResolvedMenuVisible(false)}
      >
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setResolvedMenuVisible(false)} />
          <View
            style={[
              styles.menuOverlay,
              isRTL ? styles.menuOverlayRtl : styles.menuOverlayLtr,
            ]}
          >
            <Pressable
              style={[styles.menuClose, isRTL ? styles.menuCloseRtl : styles.menuCloseLtr]}
              onPress={() => setResolvedMenuVisible(false)}
            >
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
            {shouldShowAuthenticatedMenu
              ? renderMenuItem(
                  t('headerMenuAccount'),
                  shouldShowMenuAvatar ? (
                    <CachedLogo
                      key={avatarUrl!}
                      uri={avatarUrl!}
                      style={styles.menuAvatar}
                      cachePolicy="none"
                      transition={0}
                      priority="high"
                      onError={() => setMenuAvatarLoadFailed(true)}
                    />
                  ) : (
                    <DefaultAvatar size={24} />
                  ),
                  () => {
                    setResolvedMenuVisible(false);
                    router.push('/account');
                  }
                )
              : null}
            {shouldShowAuthenticatedMenu
              ? renderMenuItem(
                  t('headerMenuMyDishes'),
                  <Ionicons name="restaurant-outline" size={20} color={theme.colors.accent} />,
                  () => {
                    setResolvedMenuVisible(false);
                    router.push('/my-dishes');
                  },
                  { badgeCount: pendingDraftCount }
                )
              : null}
            {renderMenuItem(
              t('headerMenuFavorites'),
              <Ionicons name="heart-outline" size={20} color={theme.colors.accent} />,
              () => {
                setResolvedMenuVisible(false);
                router.push('/?favorites=1');
              }
            )}
            {renderMenuItem(
              t('headerMenuPrivacy'),
              <Ionicons name="megaphone-outline" size={20} color={theme.colors.accent} />,
              () => {
                setResolvedMenuVisible(false);
                setLegalModal({
                  title: t('legalPrivacyTitle'),
                  url: getLegalUrl(locale, 'privacy'),
                });
              }
            )}
            {renderMenuItem(
              t('headerMenuTerms'),
              <Ionicons name="document-text-outline" size={20} color={theme.colors.accent} />,
              () => {
                setResolvedMenuVisible(false);
                setLegalModal({
                  title: t('legalTermsTitle'),
                  url: getLegalUrl(locale, 'terms'),
                });
              }
            )}
            {renderMenuItem(
              t('headerMenuFeedback'),
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.colors.accent} />,
              () => {
                setResolvedMenuVisible(false);
                setFeedbackVisible(true);
              }
            )}
            {renderMenuItem(
              shouldShowAuthenticatedMenu ? t('headerMenuSignOut') : t('headerMenuSignIn'),
              <Ionicons name="log-out-outline" size={20} color={theme.colors.accent} />,
              shouldShowAuthenticatedMenu ? signOut : goToLogin
            )}
          </View>
        </View>
      </Modal>
      <LegalModal
        visible={Boolean(legalModal)}
        title={legalModal?.title ?? ''}
        url={legalModal?.url ?? getLegalUrl(locale, 'terms')}
        onClose={() => setLegalModal(null)}
      />
      <Modal
        visible={feedbackVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFeedback}
      >
        <View style={styles.feedbackBackdrop}>
          <Pressable style={styles.feedbackOverlay} onPress={closeFeedback} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
            style={styles.feedbackKeyboard}
          >
            <View style={styles.feedbackCard}>
              <BlurView intensity={54} tint="light" style={styles.feedbackCardBlur} />
              <View style={styles.feedbackCardTint} />
              <Text style={[styles.feedbackTitle, !isRTL && styles.feedbackTitleLtr]}>
                {t('feedbackTitle')}
              </Text>
              <Text style={[styles.feedbackSubtitle, !isRTL && styles.feedbackSubtitleLtr]}>
                {t('feedbackSubtitle')}
              </Text>
              <TextInput
                style={[styles.feedbackInput, !isRTL && styles.feedbackInputLtr]}
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder={t('feedbackPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                multiline
                textAlignVertical="top"
                textAlign={isRTL ? 'right' : 'left'}
                selectionColor={theme.colors.accent}
                cursorColor={theme.colors.accent}
              />
              <View style={[styles.feedbackActions, !isRTL && styles.feedbackActionsLtr]}>
                <Pressable
                  style={styles.feedbackSecondaryButton}
                  onPress={closeFeedback}
                  disabled={feedbackSending}
                >
                  <Text style={styles.feedbackSecondaryButtonText}>{t('commonCancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.feedbackPrimaryButton, feedbackSending && styles.feedbackPrimaryButtonDisabled]}
                  onPress={() => void sendFeedback()}
                  disabled={feedbackSending}
                >
                  {feedbackSending ? (
                    <ActivityIndicator size="small" color={theme.colors.white} />
                  ) : (
                    <Text style={styles.feedbackPrimaryButtonText}>{t('feedbackSendAction')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingBottom: 2,
    backgroundColor: theme.colors.white,
    zIndex: 40,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  leftIcons: {
    width: 56,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  rightIcons: {
    width: 56,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerIconBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: Platform.OS === 'ios' ? 16 : 14,
    height: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: Platform.OS === 'ios' ? 2 : 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.card,
  },
  headerIconBadgeText: {
    color: theme.colors.white,
    fontSize: Platform.OS === 'ios' ? 7 : 8,
    fontFamily: Platform.OS === 'ios' ? undefined : theme.typography.bold,
    fontWeight: Platform.OS === 'ios' ? '700' : undefined,
    lineHeight: Platform.OS === 'ios' ? 9 : 9,
    textAlign: 'center',
    transform: [{ translateY: Platform.OS === 'ios' ? 0.25 : 0 }],
  },
  iconButtonBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  iconButtonTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,248,242,0.58)',
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 44,
    marginHorizontal: 8,
    paddingBottom: 2,
  },
  logoText: {
    fontSize: 20,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
  },
  logoTextHidden: {
    opacity: 0,
  },
  logoImage: {
    position: 'absolute',
    width: '100%',
    maxWidth: 172,
    height: 44,
  },
  guestHeaderIconFrame: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  guestHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  headerTapLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  logoTapTarget: {
    flex: 1,
    minHeight: 48,
    marginHorizontal: 8,
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
    top: Platform.OS === 'ios' ? 38 : 12,
    width: 220,
    zIndex: 20,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    paddingTop: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuOverlayRtl: {
    right: 16,
  },
  menuOverlayLtr: {
    left: 16,
  },
  menuClose: {
    position: 'absolute',
    top: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCloseRtl: {
    left: 8,
  },
  menuCloseLtr: {
    right: 8,
  },
  menuOption: {
    fontSize: 14,
    color: theme.colors.textMuted,
    flex: 1,
    fontFamily: theme.typography.semibold,
  },
  menuLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  menuLabelWrapLtr: {
    justifyContent: 'flex-start',
  },
  menuIconWrap: {
    width: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCountBadgeOnIcon: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? -4 : -5,
    right: Platform.OS === 'ios' ? -7 : -8,
    minWidth: Platform.OS === 'ios' ? 16 : 14,
    height: Platform.OS === 'ios' ? 16 : 14,
    borderRadius: Platform.OS === 'ios' ? 8 : 7,
    paddingHorizontal: Platform.OS === 'ios' ? 2 : 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.card,
  },
  menuCountBadgeOnIconText: {
    color: theme.colors.white,
    fontSize: Platform.OS === 'ios' ? 7 : 8,
    fontFamily: Platform.OS === 'ios' ? undefined : theme.typography.bold,
    fontWeight: Platform.OS === 'ios' ? '700' : undefined,
    lineHeight: Platform.OS === 'ios' ? 9 : 9,
    textAlign: 'center',
    transform: [{ translateY: Platform.OS === 'ios' ? 0.25 : 0 }],
  },
  menuOptionDanger: {
    color: theme.colors.danger,
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
    fontFamily: theme.typography.bold,
  },
  menuOptionRow: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  menuOptionRowLtr: {
    justifyContent: 'flex-start',
  },
  menuAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  feedbackBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 15, 10, 0.42)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  feedbackOverlay: {
    position: 'absolute',
    inset: 0,
  },
  feedbackKeyboard: {
    width: '100%',
  },
  feedbackCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,250,246,0.82)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  feedbackCardBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  feedbackCardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,248,242,0.58)',
  },
  feedbackTitle: {
    fontSize: 21,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    textAlign: 'right',
  },
  feedbackTitleLtr: {
    textAlign: 'left',
  },
  feedbackSubtitle: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.regular,
    textAlign: 'right',
  },
  feedbackSubtitleLtr: {
    textAlign: 'left',
  },
  feedbackInput: {
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.regular,
    writingDirection: 'rtl',
  },
  feedbackInputLtr: {
    writingDirection: 'ltr',
  },
  feedbackActions: {
    marginTop: 16,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  feedbackActionsLtr: {
    flexDirection: 'row',
  },
  feedbackSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  feedbackSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.typography.semibold,
  },
  feedbackPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  feedbackPrimaryButtonDisabled: {
    opacity: 0.82,
  },
  feedbackPrimaryButtonText: {
    color: theme.colors.white,
    fontSize: 16,
    fontFamily: theme.typography.bold,
  },
});
