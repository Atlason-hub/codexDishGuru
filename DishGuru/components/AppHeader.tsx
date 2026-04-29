import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { cacheLogo, clearCachedLogo, loadCachedLogo } from '../lib/logo';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CachedLogo from './CachedLogo';
import LegalModal from './LegalModal';
import { theme } from '../lib/theme';
import { applyPaletteFromLogo } from '../lib/brandPalette';
import { getLegalUrl, useLocale } from '../lib/locale';
import { fetchGlobalCompanyContext } from '../lib/appData';
import { loadGuestMode, setGuestModeEnabled } from '../lib/guestMode';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';
let lastKnownCompanyLogoUrl: string | null = null;

const resolveLogoUrl = (raw: string | null | undefined) => {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.includes('/storage/v1/object/public/')) return raw;

  const trimmed = raw.replace(/^\/+/, '');
  const objectPath = trimmed.startsWith('companies/')
    ? trimmed.replace(/^companies\//, '')
    : trimmed;
  const { data } = supabase.storage.from('companies').getPublicUrl(objectPath);
  return data?.publicUrl ?? `${SUPABASE_URL}/storage/v1/object/public/companies/${objectPath}`;
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const lastPaletteLogoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!menuVisible) {
      return;
    }

    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const guestModeEnabled = !data.session?.user?.id ? await loadGuestMode() : false;
      setIsAuthenticated(Boolean(data.session?.user?.id));
      setCurrentUserId(data.session?.user?.id ?? null);
      setIsGuestMode(guestModeEnabled);
    })();

    return () => {
      active = false;
    };
  }, [menuVisible]);

  useEffect(() => {
    let mounted = true;
    const syncHeaderState = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const guestModeEnabled = !data.session?.user?.id ? await loadGuestMode() : false;
      setIsGuestMode(guestModeEnabled);
      const sessionEmail = data.session?.user?.email ?? null;
      setIsAuthenticated(Boolean(data.session?.user?.id));
      setCurrentUserId(data.session?.user?.id ?? null);
      const cached = await loadCachedLogo();
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        setCompanyLogoUrl(resolved);
        lastKnownCompanyLogoUrl = resolved;
        if (resolved && lastPaletteLogoRef.current !== resolved) {
          lastPaletteLogoRef.current = resolved;
          applyPaletteFromLogo(resolved);
        }
      }
      const cachedAvatar = await loadCachedAvatar(data.session?.user?.id ?? null);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      const metaAvatar = await fetchAvatarFromAuth();
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        await cacheAvatar(data.session?.user?.id ?? null, metaAvatar);
      }
      if (data.session?.user?.id) {
        const url = await fetchCompanyLogoForUser(
          data.session.user.id,
          getEmailDomain(sessionEmail)
        );
        if (url) {
          setCompanyLogoUrl(url);
          lastKnownCompanyLogoUrl = url;
          cacheLogo({ logoUrl: url, logoPath: null });
          if (lastPaletteLogoRef.current !== url) {
            lastPaletteLogoRef.current = url;
            applyPaletteFromLogo(url);
          }
        }
      } else if (guestModeEnabled) {
        const globalContext = await fetchGlobalCompanyContext();
        const resolved = resolveLogoUrl(globalContext?.logoUrl ?? null);
        console.info('[guest-mode] header resolved guest logo', {
          hasContext: Boolean(globalContext),
          hasLogo: Boolean(resolved),
        });
        setCompanyLogoUrl(resolved);
        lastKnownCompanyLogoUrl = resolved;
        if (resolved && lastPaletteLogoRef.current !== resolved) {
          lastPaletteLogoRef.current = resolved;
          applyPaletteFromLogo(resolved);
        }
      } else {
        setCompanyLogoUrl(null);
        lastKnownCompanyLogoUrl = null;
      }
    };

    syncHeaderState();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionEmail = session?.user?.email ?? null;
      setIsAuthenticated(Boolean(session?.user?.id));
      setCurrentUserId(session?.user?.id ?? null);
      const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url ?? null;
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        cacheAvatar(session?.user?.id ?? null, metaAvatar);
      } else {
        setAvatarUrl(null);
        cacheAvatar(session?.user?.id ?? null, null);
      }
      if (session?.user?.id) {
        setIsGuestMode(false);
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail)).then((url) => {
          if (url) {
            setCompanyLogoUrl(url);
            lastKnownCompanyLogoUrl = url;
            cacheLogo({ logoUrl: url, logoPath: null });
            if (lastPaletteLogoRef.current !== url) {
              lastPaletteLogoRef.current = url;
              applyPaletteFromLogo(url);
            }
          }
        });
      } else {
        const guestModeEnabled = await loadGuestMode();
        setIsGuestMode(guestModeEnabled);
        if (guestModeEnabled) {
          const globalContext = await fetchGlobalCompanyContext();
          const resolved = resolveLogoUrl(globalContext?.logoUrl ?? null);
          console.info('[guest-mode] header auth-change guest logo', {
            hasContext: Boolean(globalContext),
            hasLogo: Boolean(resolved),
          });
          setCompanyLogoUrl(resolved);
          lastKnownCompanyLogoUrl = resolved;
          if (resolved && lastPaletteLogoRef.current !== resolved) {
            lastPaletteLogoRef.current = resolved;
            applyPaletteFromLogo(resolved);
          }
        } else {
          setCompanyLogoUrl(null);
          lastKnownCompanyLogoUrl = null;
          clearCachedLogo();
          lastPaletteLogoRef.current = null;
          applyPaletteFromLogo(null);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [pathname, refreshParam, headerSyncParam]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMenuVisible(false);
    setCompanyLogoUrl(null);
    lastKnownCompanyLogoUrl = null;
    setAvatarUrl(null);
    await cacheAvatar(currentUserId, null);
    await clearCachedLogo();
    router.replace('/');
  };

  const goToLogin = async () => {
    await setGuestModeEnabled(false);
    setIsGuestMode(false);
    setMenuVisible(false);
    router.replace('/');
  };

  const goHome = () => {
    setMenuVisible(false);
    const isPlainHome =
      pathname === '/' &&
      guestModeParam !== '1' &&
      favoritesParam !== '1' &&
      restaurantIdParam.length === 0 &&
      restaurantNameParam.length === 0;
    if (isPlainHome) {
      return;
    }
    router.replace({
      pathname: '/',
      params: {
        refresh: String(Date.now()),
        headerSync: String(Date.now()),
        guestMode: isGuestMode ? '1' : '0',
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
  const shouldShowHeader = hasSignedInSession || isGuestHeader;
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
    fontWeight: '700',
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
    fontWeight: '600',
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
});
