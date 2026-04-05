import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CachedLogo from '../components/CachedLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { cacheLogo, clearCachedLogo, loadCachedLogo } from '../lib/logo';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';
import DishCard from '../components/DishCard';
import { theme } from '../lib/theme';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';

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

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const refreshParam = typeof params.refresh === 'string' ? params.refresh : '';
  const scrollParam = typeof params.scrollY === 'string' ? params.scrollY : '';
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [homeSearch, setHomeSearch] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>([]);
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const avatarIdsKeyRef = useRef<string>('');
  const listRef = useRef<FlatList>(null);
  const [scrollY, setScrollY] = useState(0);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);

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

  const loadUserAvatars = async (items: DishAssociation[]) => {
    const ids = Array.from(
      new Set(items.map((item) => item.user_id).filter(Boolean) as string[])
    );
    const avatarKey = [...ids].sort().join(',');
    if (avatarKey && avatarKey === avatarIdsKeyRef.current) {
      return;
    }
    avatarIdsKeyRef.current = avatarKey;
    if (ids.length === 0) {
      setUserAvatars({});
      setUserLabels({});
      return;
    }
    const { data: profileData, error: profileError } = await supabase.rpc('get_user_profiles', {
      user_ids: ids,
    });
    if (!profileError && Array.isArray(profileData)) {
      const map: Record<string, string> = {};
      const labels: Record<string, string> = {};
      (profileData ?? []).forEach((row: any) => {
        if (row?.user_id && row?.avatar_url) {
          map[String(row.user_id)] = String(row.avatar_url);
        }
        if (row?.user_id && row?.email_prefix) {
          labels[String(row.user_id)] = String(row.email_prefix);
        }
      });
      setUserAvatars(map);
      setUserLabels(labels);
      return;
    }
    const { data, error: avatarError } = await supabase
      .from('AppUsers')
      .select('user_id, avatar_url')
      .in('user_id', ids);
    if (avatarError) {
      setUserAvatars({});
      setUserLabels({});
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((row: any) => {
      if (row?.user_id && row?.avatar_url) {
        map[String(row.user_id)] = String(row.avatar_url);
      }
    });
    setUserAvatars(map);
    setUserLabels({});
  };


  const loadDishAssociations = async () => {
    try {
      setHasLoaded(false);
      setLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const userEmail = sessionData.session?.user?.email ?? null;
      let allowedUserIds: string[] | null = null;
      if (userId) {
        const { data: profile, error: profileError } = await supabase
          .from('AppUsers')
          .select('company_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        if (profileError) throw profileError;
        let companyId = profile?.company_id ?? null;
        if (!companyId && userEmail) {
          const domain = userEmail.includes('@')
            ? userEmail.split('@').pop()?.trim().toLowerCase()
            : null;
          if (domain) {
            const { data: companyFromDomain, error: companyDomainError } = await supabase
              .from('companies')
              .select('id')
              .ilike('domain', domain)
              .limit(1)
              .maybeSingle();
            if (companyDomainError) throw companyDomainError;
            companyId = companyFromDomain?.id ?? null;
          }
        }
        if (companyId) {
          const { data: companyUsers, error: usersError } = await supabase
            .from('AppUsers')
            .select('user_id')
            .eq('company_id', companyId);
          if (!usersError) {
            allowedUserIds = (companyUsers ?? [])
              .map((row: any) => row?.user_id)
              .filter(Boolean);
          }
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'get_company_dishes',
            {
              company_id: companyId,
            }
          );
          if (!rpcError && Array.isArray(rpcData)) {
            const sorted = [...rpcData].sort((a: any, b: any) => {
              const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
              const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
              return bTime - aTime;
            });
            setDishAssociations((sorted as DishAssociation[]) ?? []);
            loadUserAvatars(sorted as DishAssociation[]);
            return;
          }
        }
      }
      if (!allowedUserIds || allowedUserIds.length === 0) {
        setDishAssociations([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from('dish_associations')
        .select(
          'id, user_id, dish_id, image_url, image_path, dish_name, restaurant_name, restaurant_id, tasty_score, filling_score, created_at'
        )
        .in('user_id', allowedUserIds)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const rows = (data ?? []) as DishAssociation[];
      setDishAssociations(rows);
      loadUserAvatars(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  const loadFavorites = async (userId: string) => {
    try {
      setFavoritesLoading(true);
      const { data, error: favError } = await supabase
        .from('dish_favorites')
        .select('dish_association_id')
        .eq('user_id', userId);
      if (favError) throw favError;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((row: any) => {
        if (row?.dish_association_id) map[String(row.dish_association_id)] = true;
      });
      setFavorites(map);
    } catch (err) {
    } finally {
      setFavoritesLoading(false);
    }
  };

  const toggleFavorite = async (dishAssociationId: string) => {
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
    } catch (err) {
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  };

  const deleteDishAssociation = async (dish: DishAssociation) => {
    Alert.alert('מחיקת מנה', 'האם למחוק את המנה והביקורות שלה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!currentUserId) {
              Alert.alert('אין הרשאה', 'יש להתחבר מחדש כדי למחוק.');
              return;
            }
            if (dish.user_id !== currentUserId) {
              Alert.alert('אין הרשאה', 'אפשר למחוק רק מנות שהעלית.');
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
            loadDishAssociations();
          } catch (err) {
            Alert.alert('שגיאה', 'מחיקה נכשלה.');
          }
        },
      },
    ]);
  };

  const fetchCompanyLogoForUser = async (userId: string, fallbackDomain?: string | null) => {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('AppUsers')
        .select('company_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (profileError) {
        setCompanyLogoUrl(null);
        return;
      }
      let companyIdValue: string | null = profile?.company_id ?? null;

      // Fallback: if no company_id on AppUsers, try matching companies by email domain
      if (!companyIdValue && fallbackDomain) {
        const { data: companyFromDomain, error: companyDomainError } = await supabase
          .from('companies')
          .select('id')
          .ilike('domain', fallbackDomain)
          .limit(1)
          .maybeSingle();
        companyIdValue = companyFromDomain?.id ?? null;
      }

      if (!companyIdValue) {
        setCompanyLogoUrl(null);
        return;
      }
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyIdValue)
        .maybeSingle();
      if (companyError || !company) {
        setCompanyLogoUrl(null);
        return;
      }
      const rawLogo = company.logo_url ?? null;
      const absoluteLogo = resolveLogoUrl(rawLogo);
      setCompanyLogoUrl(absoluteLogo);
    } catch (err) {
      setCompanyLogoUrl(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setSessionChecked(true);
      setCurrentUserId(data.session?.user?.id ?? null);
      const sessionEmail = data.session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      const cachedAvatar = await loadCachedAvatar(data.session?.user?.id ?? null);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      const metaAvatar = await fetchAvatarFromAuth();
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        await cacheAvatar(data.session?.user?.id ?? null, metaAvatar);
      }
      const cached = await loadCachedLogo();
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        setCompanyLogoUrl(resolved);
        setCompanyLogoPath(cached.logoPath);
      }
      if (data.session?.user?.id) {
        const domain = getEmailDomain(data.session.user.email ?? null);
        await Promise.all([
          fetchCompanyLogoForUser(data.session.user.id, domain),
          loadDishAssociations(),
          loadFavorites(data.session.user.id),
        ]);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      setCurrentUserId(session?.user?.id ?? null);
      const sessionEmail = session?.user?.email ?? null;
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
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail));
        loadDishAssociations();
        loadFavorites(session.user.id);
      } else {
        setCompanyLogoUrl(null);
        clearCachedLogo();
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (companyLogoUrl) {
      cacheLogo({ logoUrl: companyLogoUrl, logoPath: companyLogoPath });
    }
  }, [companyLogoUrl, companyLogoPath]);

  useEffect(() => {
    if (currentUserId) {
      loadDishAssociations();
    }
  }, [refreshParam, currentUserId]);

  useEffect(() => {
    if (!scrollParam) return;
    const offset = Number(scrollParam);
    if (!Number.isFinite(offset)) return;
    const id = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    }, 50);
    return () => clearTimeout(id);
  }, [scrollParam]);


  const signIn = async () => {
    if (!email.trim() || !pass.trim()) {
      setAuthError('אנא הזן אימייל וסיסמה.');
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });
      if (error) {
        throw error;
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'התחברות נכשלה.');
    } finally {
      setAuthLoading(false);
    }
  };

  const signUp = async () => {
    if (!email.trim() || !pass.trim() || !confirmPass.trim()) {
      setAuthError('אנא הזן אימייל, סיסמה ואישור סיסמה.');
      return;
    }
    if (pass !== confirmPass) {
      setAuthError('הסיסמאות אינן תואמות.');
      return;
    }
    try {
      setAuthLoading(true);
      setAuthError(null);
      const trimmedEmail = email.trim();
      const domainPart = trimmedEmail.includes('@')
        ? trimmedEmail.split('@').pop()?.trim().toLowerCase() ?? ''
        : '';
      if (!domainPart) {
        throw new Error('חסר דומיין אימייל');
      }
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
        throw new Error('לא נמצאה חברה לדומיין האימייל');
      }
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
      });
      if (error) {
        throw error;
      }
      const supabaseUserId = data.user?.id;
      if (supabaseUserId) {
      const { error: profileError } = await supabase.from('AppUsers').insert({
        user_id: supabaseUserId,
        email: trimmedEmail,
        company_id: companyMatch.id,
      });
      if (profileError) {
        throw profileError;
      }
      await fetchCompanyLogoForUser(supabaseUserId);
    }
      setShowSignup(false);
      setPass('');
      setConfirmPass('');
    } catch (err) {
      const authApiError =
        err && typeof err === 'object' && 'name' in err ? (err as { [k: string]: any }) : null;
      const message = authApiError?.message ?? (err instanceof Error ? err.message : 'הרשמה נכשלה.');
      const lower = message.toLowerCase();
      if (lower.includes('no company matches email domain')) {
        setAuthError('הרשמה נחסמה: דומיין האימייל אינו משויך לחברה.');
      } else if (lower.includes('database error saving new user')) {
        setAuthError('הרשמה נכשלה: דומיין האימייל חייב להתאים לחברה קיימת.');
      } else {
        setAuthError(message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserEmail(null);
    setCompanyLogoUrl(null);
    setCurrentUserId(null);
    setUserAvatars({});
    setAvatarPreviewOpen(false);
    setAvatarPreviewUrl(null);
    setAvatarPreviewLabel(null);
    await cacheAvatar(currentUserId, null);
    setAvatarUrl(null);
    await clearCachedLogo();
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

  const visibleAssociations = showFavoritesOnly
    ? dishAssociations.filter((item) => favorites[item.id])
    : showRestaurantOnly
      ? dishAssociations.filter((item) => {
          if (restaurantFilterId !== null) {
            return item.restaurant_id === restaurantFilterId;
          }
          if (restaurantFilterName) {
            return (item.restaurant_name ?? '') === restaurantFilterName;
          }
          return true;
        })
      : dishAssociations;
  const hasHeaderContent = true;
  const listHeader = (
    <View style={styles.listHeader}>
      {showRestaurantOnly && (
        <View style={styles.favoritesHeader}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
          </Pressable>
          <Text style={styles.favoritesHeaderText}>
            {restaurantFilterName ?? 'מסעדה'}
          </Text>
        </View>
      )}
      {showFavoritesOnly && (
        <View style={styles.favoritesHeader}>
          <Pressable
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
          </Pressable>
          <Text style={styles.favoritesHeaderText}>המועדפים שלי</Text>
        </View>
      )}
      {loading ? (
        <View style={styles.results}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.homeSearchBox}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.homeSearchInput}
          placeholder="חיפוש מנות או מסעדות"
          placeholderTextColor={theme.colors.textMuted}
          value={homeSearch}
          onChangeText={setHomeSearch}
          textAlign="right"
        />
        {homeSearch.trim().length > 0 ? (
          <Pressable
            style={styles.homeSearchClear}
            onPress={() => setHomeSearch('')}
            hitSlop={6}
          >
            <Ionicons name="close" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const groupedAssociations = useMemo(() => {
    const needle = homeSearch.trim().toLowerCase();
    const filtered = needle
      ? visibleAssociations.filter((item) => {
          const dishName = (item.dish_name ?? '').toLowerCase();
          const restName = (item.restaurant_name ?? '').toLowerCase();
          return dishName.includes(needle) || restName.includes(needle);
        })
      : visibleAssociations;
    const groups = new Map<string, DishAssociation[]>();
    filtered.forEach((item) => {
      const normalizedDish = (item.dish_name ?? '').trim().toLowerCase();
      const normalizedRest = (item.restaurant_name ?? '').trim().toLowerCase();
      const dishKey = normalizedDish
        ? `dishName:${normalizedDish}`
        : item.dish_id !== null
          ? `dish:${item.dish_id}`
          : 'dish:unknown';
      const restKey = normalizedRest
        ? `restName:${normalizedRest}`
        : item.restaurant_id !== null
          ? `rest:${item.restaurant_id}`
          : 'rest:unknown';
      const key = `${dishKey}|${restKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
      return Array.from(groups.entries()).map(([key, items]) => {
      const sorted = [...items].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      return {
        key,
        items: sorted,
        dishName: items[0]?.dish_name ?? '',
        restaurantName: items[0]?.restaurant_name ?? '',
        dishId: items[0]?.dish_id ?? null,
        restaurantId: items[0]?.restaurant_id ?? null,
      };
    });
  }, [homeSearch, visibleAssociations]);

  return (
    <SafeAreaView
      style={[styles.container, !isAuthenticated && styles.containerAuth]}
      edges={['left', 'right', 'bottom']}
    >
      {!sessionChecked ? (
        <View style={styles.results}>
          <ActivityIndicator size="large" />
        </View>
      ) : !isAuthenticated ? (
        <View style={styles.authScreen}>
          <Image
            source={require('../assets/images/dishguru-logo.jpg')}
            style={styles.authLogo}
          />
          <View style={styles.authCard}>
            <View style={styles.inputRow}>
              <View style={styles.inputIcon}>
                <Ionicons name="mail-outline" size={18} color="#9b4d2a" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="אימייל"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholderTextColor="#a18c7b"
                textAlign="left"
              />
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputIcon}>
                <Ionicons name="lock-closed-outline" size={18} color="#9b4d2a" />
              </View>
              <TextInput
                style={styles.inputField}
                placeholder="סיסמה"
                secureTextEntry={!showPass}
                value={pass}
                onChangeText={setPass}
                placeholderTextColor="#a18c7b"
                textAlign="left"
              />
              <Pressable style={styles.eyeButton} onPress={() => setShowPass((v) => !v)}>
                <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color="#9b4d2a" />
              </Pressable>
            </View>
            {showSignup && (
              <View style={styles.inputRow}>
                <View style={styles.inputIcon}>
                  <Ionicons name="lock-closed-outline" size={18} color="#9b4d2a" />
                </View>
                <TextInput
                  style={styles.inputField}
                  placeholder="אישור סיסמה"
                  secureTextEntry={!showConfirmPass}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  placeholderTextColor="#a18c7b"
                  textAlign="left"
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPass((v) => !v)}
                >
                  <Ionicons
                    name={showConfirmPass ? 'eye-off' : 'eye'}
                    size={18}
                    color="#9b4d2a"
                  />
                </Pressable>
              </View>
            )}
            {!showSignup && (
              <Text style={styles.forgotPasswordText}>שכחת סיסמה?</Text>
            )}
            {authError && <Text style={styles.errorText}>{authError}</Text>}
            {showSignup ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={signUp}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.loginButtonText}>צור חשבון</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.signupButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => {
                    setShowSignup(false);
                    setAuthError(null);
                  }}
                  disabled={authLoading}
                >
                  <Text style={styles.signupButtonText}>חזרה להתחברות</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={signIn}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.loginButtonText}>התחבר</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.signupButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => {
                    setShowSignup(true);
                    setAuthError(null);
                  }}
                  disabled={authLoading}
                >
                  <Text style={styles.signupButtonText}>צור חשבון</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={groupedAssociations}
          keyExtractor={(item) => item.key}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={[
            styles.feedContent,
            !hasHeaderContent && styles.feedContentNoHeader,
          ]}
          onScroll={(event) => setScrollY(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading && !error && hasLoaded ? (
              <View style={styles.results}>
                <Text style={styles.placeholderText}>
                  {showFavoritesOnly ? 'אין מנות במועדפים' : 'אין מנות להצגה'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <DishCard
              items={item.items}
              favorites={favorites}
              currentUserId={currentUserId}
              avatarUrl={avatarUrl}
              userAvatars={userAvatars}
              userLabels={userLabels}
              onAvatarPress={(url, label) => {
                setAvatarPreviewUrl(url);
                setAvatarPreviewLabel(label);
                setAvatarPreviewOpen(true);
              }}
              onToggleFavorite={(id) => toggleFavorite(id)}
              onOpenPhoto={(dish) =>
                router.push({
                  pathname: '/dish',
                  params: {
                    dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
                    dishName: dish.dish_name ?? '',
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                  },
                })
              }
              onOpenDish={(dish) =>
                router.push({
                  pathname: '/dish',
                  params: {
                    dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
                    dishName: dish.dish_name ?? '',
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                  },
                })
              }
              onOpenRestaurant={(dish) =>
                router.push({
                  pathname: '/restaurant',
                  params: {
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                  },
                })
              }
              onDelete={(dish) => deleteDishAssociation(dish)}
              onOpenCamera={(dish) =>
                router.push({
                  pathname: '/camera',
                  params: {
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                    dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
                    dishName: dish.dish_name ?? '',
                  },
                })
              }
              onEdit={(dish) =>
                router.push({
                  pathname: '/edit-dish',
                  params: { id: dish.id, returnTo: 'main', scrollY: String(scrollY) },
                })
              }
            />
          )}
        />
      )}
      {isAuthenticated && (
        <>
        </>
      )}
      <Modal
        visible={avatarPreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAvatarPreviewOpen(false);
          setAvatarPreviewUrl(null);
          setAvatarPreviewLabel(null);
        }}
      >
        <View style={styles.avatarModalBackdrop}>
          <Pressable
            style={styles.avatarModalOverlay}
            onPress={() => {
              setAvatarPreviewOpen(false);
              setAvatarPreviewUrl(null);
              setAvatarPreviewLabel(null);
            }}
          />
          <View style={styles.avatarModalWrapper}>
            <View style={styles.avatarModalCard}>
              {avatarPreviewUrl ? (
                <CachedLogo uri={avatarPreviewUrl} style={styles.avatarModalImage} />
              ) : (
                <View style={styles.avatarModalPlaceholder}>
                  <Ionicons name="person" size={64} color={theme.colors.textMuted} />
                </View>
              )}
              {avatarPreviewLabel ? (
                <View style={styles.avatarEmailPill}>
                  <Text style={styles.avatarEmailText}>{avatarPreviewLabel}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              style={styles.avatarModalClose}
              onPress={() => {
                setAvatarPreviewOpen(false);
                setAvatarPreviewUrl(null);
                setAvatarPreviewLabel(null);
              }}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </Pressable>
          </View>
        </View>
      </Modal>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    gap: 24,
    paddingTop: 36,
  },
  authLogo: {
    width: 220,
    height: 90,
    resizeMode: 'contain',
    marginTop: 6,
    marginBottom: 8,
  },
  authCard: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.cardAlt,
  },
  inputIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    textAlign: 'left',
    color: theme.colors.text,
  },
  eyeButton: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: theme.colors.danger,
    textAlign: 'right',
    marginTop: -2,
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    gap: 16,
  },
  feedContentNoHeader: {
    paddingTop: 16,
  },
  listHeader: {
    gap: 10,
    paddingBottom: 8,
  },
  homeSearchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  homeSearchClear: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 0,
  },
  favoritesHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
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
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
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
  },
  domainValue: {
    fontSize: 16,
    fontWeight: '600',
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
    fontWeight: '600',
    color: theme.colors.text,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.text,
  },
  cardSubtitleMuted: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  avatarModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  avatarModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  avatarModalWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarModalCard: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  avatarModalImage: {
    width: '100%',
    height: '100%',
  },
  avatarModalPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  avatarModalClose: {
    position: 'absolute',
    top: 8,
    right: -36,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarEmailPill: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarEmailText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
