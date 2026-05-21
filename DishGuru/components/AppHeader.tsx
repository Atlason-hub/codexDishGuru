import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageLoadEventData,
  LayoutChangeEvent,
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
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  cacheScopedLogo,
  getSessionCompanyLogoSnapshot,
  getLogoCacheScope,
  loadSessionCompanyLogo,
  loadCachedLogo,
  resolveLogoUrl,
  subscribeSessionCompanyLogo,
} from '../lib/logo';
import { cacheAvatar, hydrateAvatarForUser, loadCachedAvatar, resolveAvatarForUser } from '../lib/avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LegalModal from './LegalModal';
import { theme } from '../lib/theme';
import { applyPaletteFromLogo } from '../lib/brandPalette';
import { getLegalUrl, useLocale } from '../lib/locale';
import { fetchGlobalCompanyContext } from '../lib/appData';
import { loadGuestMode, setGuestModeEnabled } from '../lib/guestMode';
import { publishHomeTab } from '../lib/homeTabs';
import { showAppAlert } from '../lib/appDialog';
import { subscribeAvatarUpdates } from '../lib/avatarEvents';
import { setPendingLocalLogout } from '../lib/logoutGate';
import { clearUserSessionArtifacts } from '../lib/sessionCleanup';

let lastKnownCompanyLogoUrl: string | null = null;

const getSessionAvatarUrl = (session: any) =>
  ((session?.user?.user_metadata as any)?.avatar_url as string | null | undefined) ?? null;

type AppHeaderProps = {
  companyLogoUrlOverride?: string | null;
  companyLogoPathOverride?: string | null;
  debugStageOverride?: string | null;
  isAuthenticatedOverride?: boolean;
  isGuestModeOverride?: boolean;
  currentUserIdOverride?: string | null;
  currentUserEmailOverride?: string | null;
};

export default function AppHeader({
  companyLogoUrlOverride,
  companyLogoPathOverride,
  debugStageOverride,
  isAuthenticatedOverride,
  isGuestModeOverride,
  currentUserIdOverride,
  currentUserEmailOverride,
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
  const [legalModal, setLegalModal] = useState<{ title: string; url: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [debugStage, setDebugStage] = useState('init');
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [logoDebugLines, setLogoDebugLines] = useState<string[]>([]);
  const [logoInstanceKey, setLogoInstanceKey] = useState(0);
  const [sessionLogo, setSessionLogo] = useState<ReturnType<typeof getSessionCompanyLogoSnapshot>>(
    getSessionCompanyLogoSnapshot()
  );
  const [resolvedSessionLogoUrl, setResolvedSessionLogoUrl] = useState<string | null>(null);
  const lastPaletteLogoRef = useRef<string | null>(null);
  const syncRunIdRef = useRef(0);

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

  const upsertLogoDebugLine = useCallback((prefix: string, value: string) => {
    setLogoDebugLines((prev) => {
      const next = prev.filter((line) => !line.startsWith(`${prefix}=`));
      next.push(`${prefix}=${value}`);
      return next;
    });
  }, []);

  const captureLayout = useCallback(
    (prefix: string) => (event: LayoutChangeEvent) => {
      const { width, height, x, y } = event.nativeEvent.layout;
      upsertLogoDebugLine(prefix, `${Math.round(width)}x${Math.round(height)}@${Math.round(x)},${Math.round(y)}`);
    },
    [upsertLogoDebugLine]
  );

  const applyResolvedLogo = (url: string | null) => {
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
  };

  useEffect(() => {
    const applySessionLogo = (logo: ReturnType<typeof getSessionCompanyLogoSnapshot>) => {
      setSessionLogo(logo);
      setResolvedSessionLogoUrl(logo?.logoUrl ?? null);
      if (!logo?.logoUrl) {
        return;
      }
      setLogoDebugLines((prev) => {
        const preserved = prev.filter(
          (line) =>
            line.startsWith('image') ||
            line.startsWith('headerLayout=') ||
            line.startsWith('logoContainerLayout=')
        );
        return [
          'stage=session-logo',
          `email=${logo.email ?? '-'}`,
          `matchedBy=${logo.matchedBy}`,
          `appUser.company_id=${logo.appUserCompanyId ?? '-'}`,
          `company.id=${logo.companyId ?? '-'}`,
          `company.domain=${logo.domain ?? '-'}`,
          `company.logo_url=${logo.companyRowLogoUrl ?? '-'}`,
          `resolved.logoPath=${logo.logoPath ?? '-'}`,
          `resolved.logoUrl=${logo.logoUrl ?? '-'}`,
          `display.logoUrl=${logo.logoUrl}`,
          `logoLoadFailed=${logoLoadFailed ? '1' : '0'}`,
          ...preserved,
        ];
      });
    };

    applySessionLogo(getSessionCompanyLogoSnapshot());
    return subscribeSessionCompanyLogo(applySessionLogo);
  }, [logoLoadFailed]);

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
    const visibleLogoUrl = sessionLogo?.logoUrl ?? companyLogoUrl ?? null;
    setLogoLoadFailed(false);
    setLogoInstanceKey((prev) => prev + 1);
    if (!visibleLogoUrl) {
      upsertLogoDebugLine('imageEvent', '-');
      upsertLogoDebugLine('imageEventEnd', '-');
      upsertLogoDebugLine('imageSize', '-');
    }
  }, [companyLogoUrl, sessionLogo?.logoUrl, upsertLogoDebugLine]);

  const syncHeaderState = useCallback(async (sessionOverride?: any, options?: {
    useCachedAssets?: boolean;
  }) => {
    const runId = ++syncRunIdRef.current;
    const isCurrentRun = () => syncRunIdRef.current === runId;
    setDebugStage('sync:start');
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
      setDebugStage('sync:cached-assets');
      const [cached, cachedAvatar] = await Promise.all([
        loadCachedLogo(logoCacheScope),
        loadCachedAvatar(userId),
      ]);
      if (!isCurrentRun()) return;
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        applyResolvedLogo(resolved);
      }
      if (cachedAvatar) {
        setAvatarUrl(cachedAvatar);
      }
    }

    const metaAvatar = getSessionAvatarUrl(session);
    const resolvedAvatar = await resolveAvatarForUser(userId, metaAvatar);
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
      setDebugStage('sync:signed-in-logo');
      let resolvedLogo =
        getSessionCompanyLogoSnapshot() ?? (await loadSessionCompanyLogo(userId, sessionEmail));
      if (!isCurrentRun()) return;
      if (!resolvedLogo.logoUrl) {
        setDebugStage('sync:signed-in-logo-retry');
        await new Promise((resolve) => setTimeout(resolve, 250));
        resolvedLogo = await loadSessionCompanyLogo(userId, sessionEmail, { forceRefresh: true });
        if (!isCurrentRun()) return;
      }
      if (resolvedLogo.logoUrl) {
        setDebugStage('sync:signed-in-logo-ok');
        setSessionLogo(resolvedLogo);
        setResolvedSessionLogoUrl(resolvedLogo.logoUrl);
        setLogoDebugLines([
          'stage=sync:signed-in-logo-ok',
          `email=${sessionEmail ?? '-'}`,
          `uid=${userId.slice(0, 8)}`,
          `logoInstanceKey=${logoInstanceKey + 1}`,
          `matchedBy=${resolvedLogo.matchedBy}`,
          `appUser.company_id=${resolvedLogo.appUserCompanyId ?? '-'}`,
          `company.id=${resolvedLogo.companyId ?? '-'}`,
          `company.domain=${resolvedLogo.domain ?? '-'}`,
          `company.logo_url=${resolvedLogo.companyRowLogoUrl ?? '-'}`,
          `resolved.logoPath=${resolvedLogo.logoPath ?? '-'}`,
          `resolved.logoUrl=${resolvedLogo.logoUrl ?? '-'}`,
          `display.logoUrl=${resolvedLogo.logoUrl ? `${resolvedLogo.logoUrl}${resolvedLogo.logoUrl.includes('?') ? '&' : '?'}cb=${logoInstanceKey + 1}` : '-'}`,
          'logoLoadFailed=0',
        ]);
      } else if (!lastKnownCompanyLogoUrl) {
        setDebugStage('sync:signed-in-logo-missing');
        setSessionLogo(resolvedLogo);
        setResolvedSessionLogoUrl(null);
        setLogoDebugLines([
          'stage=sync:signed-in-logo-missing',
          `email=${sessionEmail ?? '-'}`,
          `uid=${userId.slice(0, 8)}`,
          `matchedBy=${resolvedLogo.matchedBy}`,
          `appUser.company_id=${resolvedLogo.appUserCompanyId ?? '-'}`,
          `company.id=${resolvedLogo.companyId ?? '-'}`,
          `company.domain=${resolvedLogo.domain ?? '-'}`,
          `company.logo_url=${resolvedLogo.companyRowLogoUrl ?? '-'}`,
          `resolved.logoPath=${resolvedLogo.logoPath ?? '-'}`,
          `resolved.logoUrl=${resolvedLogo.logoUrl ?? '-'}`,
          'logoLoadFailed=0',
        ]);
      } else {
        setDebugStage('sync:signed-in-logo-keep-cache');
      }
      return;
    }

    if (guestModeEnabled) {
      setDebugStage('sync:guest-logo');
      setSessionLogo(null);
      setResolvedSessionLogoUrl(null);
      const globalContext = await fetchGlobalCompanyContext();
      if (!isCurrentRun()) return;
      const resolved = resolveLogoUrl(globalContext?.logoUrl ?? null);
      console.info('[guest-mode] header resolved guest logo', {
        hasContext: Boolean(globalContext),
        hasLogo: Boolean(resolved),
      });
      applyResolvedLogo(resolved);
      await cacheScopedLogo({ logoUrl: resolved, logoPath: globalContext?.logoUrl ?? null }, logoCacheScope);
      return;
    }

    setDebugStage('sync:logged-out-clear');
    setSessionLogo(null);
    setResolvedSessionLogoUrl(null);
    applyResolvedLogo(null);
  }, []);

  useEffect(() => {
    if (pathname === '/' && skipLaunchParam === '1' && !currentUserId && !isAuthenticated) {
      setDebugStage('effect:skiplaunch-hide');
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
      await syncHeaderState(session);
    });

    return () => {
      mounted = false;
      syncRunIdRef.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, [guestModeParam, hasExternalAuthControl, headerSyncParam, refreshParam, skipLaunchParam, syncHeaderState]);

  useEffect(() => {
    let cancelled = false;

    if (!effectiveCurrentUserId) {
      setAvatarUrl(null);
      return () => {
        cancelled = true;
      };
    }

    const hydrateAvatar = async () => {
      const cachedAvatar = await loadCachedAvatar(effectiveCurrentUserId);
      if (!cancelled && cachedAvatar) {
        setAvatarUrl(cachedAvatar);
      }

      const resolvedAvatar = await hydrateAvatarForUser(effectiveCurrentUserId);
      if (!cancelled) {
        setAvatarUrl(resolvedAvatar);
      }
    };

    void hydrateAvatar();

    return () => {
      cancelled = true;
    };
  }, [effectiveCurrentUserId]);

  useEffect(() => {
    return subscribeAvatarUpdates(({ userId, avatarUrl: nextAvatarUrl }) => {
      if (!effectiveCurrentUserId || userId !== effectiveCurrentUserId) return;
      setAvatarUrl(nextAvatarUrl);
    });
  }, [effectiveCurrentUserId]);

  const signOut = async () => {
    setDebugStage('logout:start');
    setPendingLocalLogout(true);
    setMenuVisible(false);
    setIsLoggingOut(true);
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setCurrentUserId(null);
    setSessionLogo(null);
    setResolvedSessionLogoUrl(null);
    setAvatarUrl(null);
    applyResolvedLogo(null);
    setDebugStage('logout:clear-caches');
    await clearUserSessionArtifacts(effectiveCurrentUserId, effectiveCurrentUserEmail);
    await setGuestModeEnabled(false);
    await cacheAvatar(effectiveCurrentUserId, null);
    try {
      setDebugStage('logout:supabase');
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      setDebugStage('logout:route-replace');
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
    setMenuVisible(false);
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
      const { error } = await supabase.functions.invoke('send-feedback', {
        body: {
          message: trimmed,
          email: currentUserEmail,
          locale,
          platform: Platform.OS,
          pathname,
          isGuestMode,
          userId: currentUserId,
        },
      });
      if (error) {
        throw error;
      }
      closeFeedback();
      showAppAlert(t('feedbackTitle'), t('feedbackSuccessMessage'));
    } catch {
      showAppAlert(t('feedbackTitle'), t('feedbackSendFailedMessage'));
    } finally {
      setFeedbackSending(false);
    }
  };

  const goHome = () => {
    setMenuVisible(false);
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

  const renderMenuItem = (label: string, icon: React.ReactNode, onPress: () => void) => (
    <Pressable
      style={[styles.menuOptionRow, !isRTL && styles.menuOptionRowLtr]}
      onPress={onPress}
    >
      {isRTL ? (
        <>
          <Text style={[styles.menuOption, { textAlign: 'right' }]}>{label}</Text>
          {icon}
        </>
      ) : (
        <>
          {icon}
          <Text style={[styles.menuOption, { textAlign: 'left' }]}>{label}</Text>
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
  const effectiveCompanyLogoUrl = hasSignedInSession
    ? (
        companyLogoUrlOverride ??
        resolvedSessionLogoUrl ??
        sessionLogo?.logoUrl ??
        sessionLogoSnapshot?.logoUrl ??
        companyLogoUrl ??
        null
      )
    : companyLogoUrl;
  const effectiveLogoDisplayUrl = effectiveCompanyLogoUrl
    ? `${effectiveCompanyLogoUrl}${effectiveCompanyLogoUrl.includes('?') ? '&' : '?'}cb=${logoInstanceKey || 1}`
    : null;
  const shouldShowCompanyLogo = hasSignedInSession && Boolean(effectiveLogoDisplayUrl) && !logoLoadFailed;
  const headerVisualKey = hasSignedInSession
    ? `auth:${effectiveCurrentUserId ?? 'anon'}:${effectiveCurrentUserEmail ?? ''}:${skipLaunchParam}`
    : isGuestHeader
      ? `guest:${guestModeParam || '0'}:${skipLaunchParam}`
      : `logged-out:${skipLaunchParam}`;

  if (!shouldShowHeader) {
    return null;
  }

  return (
    <View
      key={headerVisualKey}
      style={[styles.header, { paddingTop: insets.top + 6 }]}
      onLayout={captureLayout('headerLayout')}
    >
      <View style={styles.leftIcons}>
        {!isRTL ? (
          <Pressable style={styles.iconButton} onPress={() => setMenuVisible((prev) => !prev)}>
            <Ionicons name="menu" size={28} color={theme.colors.ink} />
          </Pressable>
        ) : (
          <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
            <Ionicons name="search" size={24} color={theme.colors.ink} />
          </Pressable>
        )}
      </View>
      <Pressable
        style={styles.logoContainer}
        onPress={goHome}
        onLayout={captureLayout('logoContainerLayout')}
      >
        <Text style={[styles.logoText, shouldShowCompanyLogo && styles.logoTextHidden]}>DishGuru</Text>
        {shouldShowCompanyLogo ? (
          <Image
            key={`${logoInstanceKey}:${effectiveLogoDisplayUrl}`}
            source={{ uri: effectiveLogoDisplayUrl! }}
            style={styles.logoImage}
            onLoadStart={() => {
              upsertLogoDebugLine('imageEvent', 'loadStart');
            }}
            onLoad={(event: { nativeEvent: ImageLoadEventData }) => {
              const source = event.nativeEvent.source;
              upsertLogoDebugLine('imageEvent', 'load');
              upsertLogoDebugLine('imageSize', `${source.width}x${source.height}`);
            }}
            onLoadEnd={() => {
              upsertLogoDebugLine('imageEventEnd', 'loadEnd');
            }}
            onError={() => {
              setLogoLoadFailed(true);
              upsertLogoDebugLine('imageEvent', 'error');
              upsertLogoDebugLine('logoLoadFailed', '1');
            }}
            resizeMode="contain"
            onLayout={captureLayout('imageLayout')}
          />
        ) : null}
      </Pressable>
      <View style={styles.rightIcons}>
        {isRTL ? (
          <Pressable style={styles.iconButton} onPress={() => setMenuVisible((prev) => !prev)}>
            <Ionicons name="menu" size={28} color={theme.colors.ink} />
          </Pressable>
        ) : (
          <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
            <Ionicons name="search" size={24} color={theme.colors.ink} />
          </Pressable>
        )}
      </View>
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <View
            style={[
              styles.menuOverlay,
              isRTL ? styles.menuOverlayRtl : styles.menuOverlayLtr,
            ]}
          >
            <Pressable
              style={[styles.menuClose, isRTL ? styles.menuCloseRtl : styles.menuCloseLtr]}
              onPress={() => setMenuVisible(false)}
            >
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
            {shouldShowAuthenticatedMenu
              ? renderMenuItem(
                  t('headerMenuAccount'),
                  avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.menuAvatar} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={20} color={theme.colors.accent} />
                  ),
                  () => {
                    setMenuVisible(false);
                    router.push('/account');
                  }
                )
              : null}
            {shouldShowAuthenticatedMenu
              ? renderMenuItem(
                  t('headerMenuMyDishes'),
                  <Ionicons name="restaurant-outline" size={20} color={theme.colors.accent} />,
                  () => {
                    setMenuVisible(false);
                    router.push('/my-dishes');
                  }
                )
              : null}
            {renderMenuItem(
              t('headerMenuFavorites'),
              <Ionicons name="heart-outline" size={20} color={theme.colors.accent} />,
              () => {
                setMenuVisible(false);
                router.push('/?favorites=1');
              }
            )}
            {renderMenuItem(
              t('headerMenuPrivacy'),
              <Ionicons name="megaphone-outline" size={20} color={theme.colors.accent} />,
              () => {
                setMenuVisible(false);
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
                setMenuVisible(false);
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
                setMenuVisible(false);
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
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 72,
  },
  rightIcons: {
    width: 72,
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
    justifyContent: 'center',
    minWidth: 0,
    minHeight: 44,
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
  debugOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 96,
    zIndex: 40,
    backgroundColor: 'rgba(30, 16, 8, 0.94)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  debugText: {
    color: '#F7EEE7',
    fontSize: 10,
    lineHeight: 13,
    fontFamily: theme.typography.regular,
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
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
