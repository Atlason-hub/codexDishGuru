import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { cacheLogo, clearCachedLogo, loadCachedLogo } from '../lib/logo';
import { cacheAvatar, loadCachedAvatar, resolveAvatarForUser } from '../lib/avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CachedLogo from './CachedLogo';
import LegalModal from './LegalModal';
import { theme } from '../lib/theme';
import { applyPaletteFromLogo } from '../lib/brandPalette';
import { getLegalUrl, useLocale } from '../lib/locale';
import { fetchGlobalCompanyContext } from '../lib/appData';
import { loadGuestMode, setGuestModeEnabled } from '../lib/guestMode';
import { publishHomeTab } from '../lib/homeTabs';
import { showAppAlert } from '../lib/appDialog';
import { subscribeAvatarUpdates } from '../lib/avatarEvents';

const SUPABASE_URL = 'https://pcamdhbgjbsnfwicyiqa.supabase.co';
let lastKnownCompanyLogoUrl: string | null = null;

const resolveLogoUrl = (raw: string | null | undefined) => {
  if (!raw) return null;
  if (raw.includes('/storage/v1/object/public/')) {
    const parts = raw.split('/storage/v1/object/public/');
    if (parts.length === 2) {
      const tail = parts[1];
      const segments = tail.split('/');
      const bucket = segments[0];
      const objectPath = segments.slice(1).join('/');
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      return data?.publicUrl ?? raw;
    }
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;

  const trimmed = raw.replace(/^\/+/, '');
  const objectPath = trimmed.startsWith('companies/')
    ? trimmed.replace(/^companies\//, '')
    : trimmed;
  const bucket = trimmed.startsWith('companies/') ? 'company-logos' : 'company-logos';
  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl ?? `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
};

const getEmailDomain = (value: string | null | undefined) => {
  if (!value) return null;
  const atIndex = value.lastIndexOf('@');
  if (atIndex === -1) return null;
  const domain = value.slice(atIndex + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
};

const fetchCompanyLogoForUser = async (userId: string, fallbackDomain?: string | null) => {
  const { data: profile } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  let companyIdValue: string | null = profile?.company_id ?? null;
  if (!companyIdValue && fallbackDomain) {
    const { data: companyFromDomain } = await supabase
      .from('companies')
      .select('id')
      .ilike('domain', fallbackDomain)
      .limit(1)
      .maybeSingle();
    companyIdValue = companyFromDomain?.id ?? null;
  }
  if (!companyIdValue) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('logo_url')
    .eq('id', companyIdValue)
    .maybeSingle();
  return resolveLogoUrl((company as any)?.logo_url ?? null);
};

const getSessionAvatarUrl = (session: any) =>
  ((session?.user?.user_metadata as any)?.avatar_url as string | null | undefined) ?? null;

export default function AppHeader() {
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
  const lastPaletteLogoRef = useRef<string | null>(null);

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

  const syncHeaderState = useCallback(async (sessionOverride?: any, options?: {
    useCachedAssets?: boolean;
  }) => {
    const session =
      sessionOverride ?? (await supabase.auth.getSession()).data.session;
    const userId = session?.user?.id ?? null;
    const guestModeEnabled = !userId ? await loadGuestMode() : false;
    const sessionEmail = session?.user?.email ?? null;

    if (userId || guestModeEnabled) {
      setIsLoggingOut(false);
    }
    setIsGuestMode(guestModeEnabled);
    setIsAuthenticated(Boolean(userId));
    setCurrentUserId(userId);
    setCurrentUserEmail(sessionEmail);

    if (options?.useCachedAssets) {
      const [cached, cachedAvatar] = await Promise.all([
        loadCachedLogo(),
        loadCachedAvatar(userId),
      ]);
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
      const url = await fetchCompanyLogoForUser(userId, getEmailDomain(sessionEmail));
      if (url) {
        applyResolvedLogo(url);
        await cacheLogo({ logoUrl: url, logoPath: null });
      } else {
        applyResolvedLogo(null);
      }
      return;
    }

    if (guestModeEnabled) {
      const globalContext = await fetchGlobalCompanyContext();
      const resolved = resolveLogoUrl(globalContext?.logoUrl ?? null);
      console.info('[guest-mode] header resolved guest logo', {
        hasContext: Boolean(globalContext),
        hasLogo: Boolean(resolved),
      });
      applyResolvedLogo(resolved);
      return;
    }

    applyResolvedLogo(null);
    await clearCachedLogo();
  }, []);

  useEffect(() => {
    if (pathname === '/' && skipLaunchParam === '1') {
      setMenuVisible(false);
      setIsLoggingOut(true);
      setIsAuthenticated(false);
      setIsGuestMode(false);
      setCurrentUserId(null);
      setAvatarUrl(null);
      applyResolvedLogo(null);
    }
  }, [pathname, skipLaunchParam]);

  useEffect(() => {
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
      subscription.subscription.unsubscribe();
    };
  }, [guestModeParam, headerSyncParam, refreshParam, skipLaunchParam, syncHeaderState]);

  useEffect(() => {
    return subscribeAvatarUpdates(({ userId, avatarUrl: nextAvatarUrl }) => {
      if (!currentUserId || userId !== currentUserId) return;
      setAvatarUrl(nextAvatarUrl);
    });
  }, [currentUserId]);

  const signOut = async () => {
    setMenuVisible(false);
    setIsLoggingOut(true);
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setCurrentUserId(null);
    setAvatarUrl(null);
    applyResolvedLogo(null);
    await setGuestModeEnabled(false);
    await cacheAvatar(currentUserId, null);
    await clearCachedLogo();
    try {
      await supabase.auth.signOut();
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
    await setGuestModeEnabled(false);
    setIsGuestMode(false);
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

  const hasSignedInSession = isAuthenticated || Boolean(currentUserId);
  const isGuestHeader =
    !hasSignedInSession && (isGuestMode || guestModeParam === '1');
  const shouldShowHeader =
    pathname !== '/' || skipLaunchParam !== '1'
      ? !isLoggingOut && (hasSignedInSession || isGuestHeader)
      : false;
  const shouldShowAuthenticatedMenu = hasSignedInSession;

  if (!shouldShowHeader) {
    return null;
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
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
      <Pressable style={styles.logoContainer} onPress={goHome}>
        {companyLogoUrl ? (
          <CachedLogo
            uri={companyLogoUrl}
            style={styles.logoImage}
            contentFit="contain"
            priority="high"
            transition={90}
            allowDownscaling={false}
          />
        ) : (
          <Text style={styles.logoText}>DishGuru</Text>
        )}
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
                    <CachedLogo uri={avatarUrl} style={styles.menuAvatar} />
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
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
  },
  logoImage: {
    width: 172,
    height: 44,
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
