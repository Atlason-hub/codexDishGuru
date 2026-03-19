import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadCachedLogo } from '../lib/logo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CachedLogo from './CachedLogo';

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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const sessionEmail = data.session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      const cached = await loadCachedLogo();
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        setCompanyLogoUrl(resolved);
      }
      if (data.session?.user?.id) {
        const url = await fetchCompanyLogoForUser(
          data.session.user.id,
          getEmailDomain(sessionEmail)
        );
        if (url) setCompanyLogoUrl(url);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      if (session?.user?.id) {
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail)).then((url) => {
          if (url) setCompanyLogoUrl(url);
        });
      } else {
        setCompanyLogoUrl(null);
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
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.leftIcons}>
        <Pressable style={styles.iconButton} onPress={() => router.push('/camera')}>
          <Ionicons name="camera" size={24} color="#111111" />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => {}}>
          <Ionicons name="search" size={24} color="#111111" />
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
          <Ionicons name="menu" size={28} color="#111111" />
        </Pressable>
      </View>
      {menuVisible && (
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuClose} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close" size={20} color="#333333" />
            </Pressable>
            <View style={styles.menuUserRow}>
              <Ionicons name="person-circle-outline" size={36} color="#111111" />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.menuLabel}>{userEmail ?? 'User'}</Text>
              </View>
            </View>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Privacy</Text>
            </Pressable>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Terms</Text>
            </Pressable>
            <Pressable style={styles.signOutMenuButton} onPress={signOut}>
              <Text style={styles.signOutMenuText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      )}
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
    borderBottomColor: '#eeeeee',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
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
    color: '#111111',
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    shadowColor: '#000',
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
    color: '#111111',
    marginBottom: 4,
  },
  menuOption: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  signOutMenuButton: {
    marginTop: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#111111',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  signOutMenuText: {
    color: '#ffffff',
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
});
