import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { cacheLogo, clearCachedLogo, loadCachedLogo } from '../lib/logo';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CachedLogo from './CachedLogo';
import { theme } from '../lib/theme';
import { applyPaletteFromLogo } from '../lib/brandPalette';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';

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
  return resolveLogoUrl(company?.logo_url ?? null);
};

export default function AppHeader() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const lastPaletteLogoRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const sessionEmail = data.session?.user?.email ?? null;
      setIsAuthenticated(Boolean(data.session?.user?.id));
      setCurrentUserId(data.session?.user?.id ?? null);
      setUserEmail(sessionEmail);
      const cached = await loadCachedLogo();
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        setCompanyLogoUrl(resolved);
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
          cacheLogo({ logoUrl: url, logoPath: null });
          if (lastPaletteLogoRef.current !== url) {
            lastPaletteLogoRef.current = url;
            applyPaletteFromLogo(url);
          }
        }
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email ?? null;
      setIsAuthenticated(Boolean(session?.user?.id));
      setCurrentUserId(session?.user?.id ?? null);
      setUserEmail(sessionEmail);
      const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url ?? null;
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        cacheAvatar(session?.user?.id ?? null, metaAvatar);
      } else {
        setAvatarUrl(null);
        cacheAvatar(session?.user?.id ?? null, null);
      }
      if (session?.user?.id) {
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail)).then((url) => {
          if (url) {
            setCompanyLogoUrl(url);
            cacheLogo({ logoUrl: url, logoPath: null });
            if (lastPaletteLogoRef.current !== url) {
              lastPaletteLogoRef.current = url;
              applyPaletteFromLogo(url);
            }
          }
        });
      } else {
        setCompanyLogoUrl(null);
        clearCachedLogo();
        lastPaletteLogoRef.current = null;
        applyPaletteFromLogo(null);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMenuVisible(false);
    setUserEmail(null);
    setCompanyLogoUrl(null);
    setAvatarUrl(null);
    await cacheAvatar(currentUserId, null);
    await clearCachedLogo();
    router.replace('/');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.leftIcons}>
        <Pressable style={styles.iconButton} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={24} color={theme.colors.ink} />
        </Pressable>
      </View>
      <Pressable style={styles.logoContainer} onPress={() => router.push('/')}>
        {companyLogoUrl ? (
          <CachedLogo uri={companyLogoUrl} style={styles.logoImage} />
        ) : (
          <Text style={styles.logoText}>DishGuru</Text>
        )}
      </Pressable>
      <View style={styles.rightIcons}>
        <Pressable style={styles.iconButton} onPress={() => setMenuVisible((prev) => !prev)}>
          <Ionicons name="menu" size={28} color={theme.colors.ink} />
        </Pressable>
      </View>
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuClose} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close" size={20} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.menuOptionRow}
              onPress={() => {
                setMenuVisible(false);
                router.push('/account');
              }}
            >
              <Text style={styles.menuOption}>החשבון שלי</Text>
              {avatarUrl ? (
                <CachedLogo uri={avatarUrl} style={styles.menuAvatar} />
              ) : (
                <Ionicons name="person-circle-outline" size={20} color={theme.colors.accent} />
              )}
            </Pressable>
            <Pressable
              style={styles.menuOptionRow}
              onPress={() => {
                setMenuVisible(false);
                router.push('/my-dishes');
              }}
            >
              <Text style={styles.menuOption}>המנות שלי</Text>
              <Ionicons name="restaurant-outline" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable
              style={styles.menuOptionRow}
              onPress={() => {
                setMenuVisible(false);
                router.push('/?favorites=1');
              }}
            >
              <Text style={styles.menuOption}>המועדפים שלי</Text>
              <Ionicons name="heart-outline" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>מדיניות פרטיות</Text>
              <Ionicons name="megaphone-outline" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>תנאים</Text>
              <Ionicons name="document-text-outline" size={20} color={theme.colors.accent} />
            </Pressable>
            <Pressable style={styles.menuOptionRow} onPress={signOut}>
              <Text style={styles.menuOption}>התנתקות</Text>
              <Ionicons name="log-out-outline" size={20} color={theme.colors.accent} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingBottom: 6,
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
    top: Platform.OS === 'ios' ? 38 : 12,
    right: 16,
    width: 220,
    zIndex: 20,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 12,
    paddingTop: 12,
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
    left: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOption: {
    fontSize: 14,
    color: theme.colors.textMuted,
    flex: 1,
    textAlign: 'right',
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
  menuAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
