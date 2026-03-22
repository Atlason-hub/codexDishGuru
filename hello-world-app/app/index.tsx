import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CachedLogo from '../components/CachedLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { loadCachedLogo } from '../lib/logo';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { cacheAvatar, fetchAvatarFromAuth, loadCachedAvatar } from '../lib/avatar';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';

type DishAssociation = {
  id: string;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  fast_score: number | null;
  filling_score: number | null;
  created_at: string | null;
};

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showSignup, setShowSignup] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userEmailDomain, setUserEmailDomain] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyFetchError, setCompanyFetchError] = useState<string | null>(null);
  const [companyDebugJson, setCompanyDebugJson] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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

  const loadDishAssociations = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('dish_associations')
        .select(
          'id, dish_id, image_url, dish_name, restaurant_name, restaurant_id, tasty_score, fast_score, filling_score, created_at'
        )
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setDishAssociations((data as DishAssociation[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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
      console.log('[FAVORITES_LOAD_ERROR]:', err);
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
      console.log('[FAVORITE_TOGGLE_ERROR]:', err);
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  };

  const fetchCompanyLogoForUser = async (userId: string, fallbackDomain?: string | null) => {
    try {
      setCompanyFetchError(null);
      const { data: profile, error: profileError } = await supabase
        .from('AppUsers')
        .select('company_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (profileError) {
        setCompanyLogoUrl(null);
        setCompanyDomain(null);
        setCompanyId(null);
        setCompanyDebugJson(null);
        setCompanyFetchError(profileError.message ?? 'AppUsers fetch error');
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
        if (companyDomainError) {
          setCompanyFetchError(companyDomainError.message ?? 'companies domain fetch error');
        }
        companyIdValue = companyFromDomain?.id ?? null;
      }

      if (!companyIdValue) {
        setCompanyLogoUrl(null);
        setCompanyDomain(null);
        setCompanyId(null);
        setCompanyDebugJson(null);
        return;
      }
      setCompanyId(companyIdValue);
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyIdValue)
        .maybeSingle();
      if (companyError || !company) {
        setCompanyLogoUrl(null);
        setCompanyDomain(null);
        setCompanyDebugJson(null);
        if (companyError) setCompanyFetchError(companyError.message ?? 'companies fetch error');
        return;
      }
      setCompanyDebugJson(JSON.stringify(company, null, 2));
      const rawLogo = company.logo_url ?? null;
      const absoluteLogo = resolveLogoUrl(rawLogo);
      setCompanyLogoUrl(absoluteLogo);
      const domainValue =
        typeof company.domain === 'string'
          ? company.domain
          : typeof (company as any).normalized === 'string'
          ? (company as any).normalized
          : null;
      setCompanyDomain(domainValue);
    } catch (err) {
      setCompanyLogoUrl(null);
      setCompanyDomain(null);
      setCompanyId(null);
      setCompanyDebugJson(null);
      setCompanyFetchError(err instanceof Error ? err.message : 'Unknown company lookup error');
    }
  };

  const getAbsoluteLogoUrl = (url: string | null | undefined) => {
    if (!url) {
      return null;
    }
    if (url.startsWith('data:')) {
      return url;
    }
    // If this is the Supabase proxy /api/logo?path=... just prefix host
    if (url.startsWith('/api/logo?') || url.includes('/api/logo?path=')) {
      if (url.startsWith('http')) return url;
      if (url.startsWith('/')) return `${SUPABASE_URL}${url}`;
      return `${SUPABASE_URL}/${url}`;
    }
    if (url.startsWith('http')) {
      return url;
    }
    if (url.startsWith('//')) {
      return `https:${url}`;
    }
    if (url.startsWith('/')) {
      return `${SUPABASE_URL}${url}`;
    }
    return `${SUPABASE_URL}/${url}`;
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setSessionChecked(true);
      const sessionEmail = data.session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      setUserEmailDomain(getEmailDomain(sessionEmail));
      const cachedAvatar = await loadCachedAvatar();
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      const metaAvatar = await fetchAvatarFromAuth();
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        await cacheAvatar(metaAvatar);
      }
      const cached = await loadCachedLogo();
      if (cached.logoUrl || cached.logoPath) {
        const resolved = cached.logoUrl ?? resolveLogoUrl(cached.logoPath);
        setCompanyLogoUrl(resolved);
        setCompanyLogoPath(cached.logoPath);
      }
      if (data.session?.user?.id) {
        await fetchCompanyLogoForUser(
          data.session.user.id,
          getEmailDomain(data.session.user.email ?? null)
        );
        await loadDishAssociations();
        await loadFavorites(data.session.user.id);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      const sessionEmail = session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      setUserEmailDomain(getEmailDomain(sessionEmail));
      const metaAvatar = (session?.user?.user_metadata as any)?.avatar_url ?? null;
      if (metaAvatar) {
        setAvatarUrl(metaAvatar);
        cacheAvatar(metaAvatar);
      }
      if (session?.user?.id) {
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail));
        loadDishAssociations();
        loadFavorites(session.user.id);
      } else {
        setCompanyLogoUrl(null);
        setCompanyDomain(null);
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!email.trim() || !pass.trim()) {
      setAuthError('Please enter email and password.');
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
      setAuthError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const signUp = async () => {
    if (!email.trim() || !pass.trim() || !confirmPass.trim()) {
      setAuthError('Please enter email, password, and confirm password.');
      return;
    }
    if (pass !== confirmPass) {
      setAuthError('Passwords do not match.');
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
        throw new Error('Email domain missing');
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
        throw new Error('No company matches email domain');
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
      const message = authApiError?.message ?? (err instanceof Error ? err.message : 'Signup failed.');
      const lower = message.toLowerCase();
      if (lower.includes('no company matches email domain')) {
        setAuthError('Signup blocked: your email domain is not associated with a company.');
      } else if (lower.includes('database error saving new user')) {
        setAuthError('Signup failed: your email domain must match an existing company.');
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
    setUserEmailDomain(null);
    setCompanyLogoUrl(null);
    setCompanyDomain(null);
    setCompanyId(null);
    setCompanyFetchError(null);
    setCompanyDebugJson(null);
  };

  const showFavoritesOnly =
    typeof params.favorites === 'string' ? params.favorites === '1' : false;
  const visibleAssociations = showFavoritesOnly
    ? dishAssociations.filter((item) => favorites[item.id])
    : dishAssociations;

  return (
    <SafeAreaView style={styles.container}>
      {!sessionChecked ? (
        <View style={styles.results}>
          <ActivityIndicator size="large" />
        </View>
      ) : !isAuthenticated ? (
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>{showSignup ? 'Create account' : 'Sign in'}</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputField}
              placeholder="Password"
              secureTextEntry={!showPass}
              value={pass}
              onChangeText={setPass}
            />
            <Pressable style={styles.eyeButton} onPress={() => setShowPass((v) => !v)}>
              <Ionicons name={showPass ? 'eye-off' : 'eye'} size={18} color="#666666" />
            </Pressable>
          </View>
          {showSignup && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputField}
                placeholder="Confirm password"
                secureTextEntry={!showConfirmPass}
                value={confirmPass}
                onChangeText={setConfirmPass}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowConfirmPass((v) => !v)}
              >
                <Ionicons name={showConfirmPass ? 'eye-off' : 'eye'} size={18} color="#666666" />
              </Pressable>
            </View>
          )}
          {authError && <Text style={styles.errorText}>{authError}</Text>}
          {showSignup ? (
            <>
              <Pressable style={styles.loginButton} onPress={signUp} disabled={authLoading}>
                {authLoading ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.loginButtonText}>Create account</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.signupButton}
                onPress={() => {
                  setShowSignup(false);
                  setAuthError(null);
                }}
                disabled={authLoading}
              >
                <Text style={styles.signupButtonText}>Back to login</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.loginButton} onPress={signIn} disabled={authLoading}>
                {authLoading ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.signupButton}
                onPress={() => {
                  setShowSignup(true);
                  setAuthError(null);
                }}
                disabled={authLoading}
              >
                <Text style={styles.signupButtonText}>Create account</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <FlatList
          data={visibleAssociations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.feedContent}
          ListHeaderComponent={
            <>
              {showFavoritesOnly && (
                <View style={styles.favoritesHeader}>
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
            </>
          }
          ListEmptyComponent={
            !loading && !error ? (
              <View style={styles.results}>
                <Text style={styles.placeholderText}>
                  {showFavoritesOnly ? 'אין מנות במועדפים' : 'אין מנות להצגה'}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.feedCard}>
              <View style={styles.feedImageWrap}>
                {item.image_url ? (
                  <CachedLogo uri={item.image_url} style={styles.feedImage} />
                ) : (
                  <View style={styles.feedImagePlaceholder} />
                )}
                <LinearGradient
                  colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.0)']}
                  style={styles.imageGradient}
                />
                <Pressable
                  style={styles.cameraBadge}
                  onPress={() =>
                    router.push({
                      pathname: '/camera',
                      params: {
                        restaurantId: item.restaurant_id ? String(item.restaurant_id) : '',
                        restaurantName: item.restaurant_name ?? '',
                        dishId: item.dish_id !== null ? String(item.dish_id) : '',
                        dishName: item.dish_name ?? '',
                      },
                    })
                  }
                >
                  <Ionicons name="camera" size={18} color="#E2E8F0" />
                </Pressable>
                <Pressable style={styles.heartBadge} onPress={() => toggleFavorite(item.id)}>
                  <Ionicons
                    name={favorites[item.id] ? 'heart' : 'heart-outline'}
                    size={18}
                    color="#E2E8F0"
                  />
                </Pressable>
                <Text style={styles.imageDateText}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                </Text>
                <View style={styles.avatarBadge}>
                  {avatarUrl ? (
                    <CachedLogo uri={avatarUrl} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={16} color="#111111" />
                  )}
                </View>
                <View style={styles.imageTextBlock}>
                  <Text style={styles.imageDishText} numberOfLines={1} ellipsizeMode="tail">
                    {item.dish_name ?? 'מנה'}
                  </Text>
                  <Text style={styles.imageRestaurantText} numberOfLines={1} ellipsizeMode="tail">
                    {item.restaurant_name ??
                      (item.restaurant_id ? `מסעדה ${item.restaurant_id}` : 'מסעדה')}
                  </Text>
                </View>
                <View style={styles.orderBadge}>
                  <Ionicons name="cart-outline" size={24} color="#F87171" />
                  <Text style={styles.orderText}>הזמן</Text>
                </View>
              </View>
              <View style={styles.ratingRow}>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>{item.tasty_score ?? 0}%</Text>
                    <Ionicons name="fast-food-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>טעים</Text>
                </View>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>{item.fast_score ?? 0}%</Text>
                    <Ionicons name="rocket-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>מהיר</Text>
                </View>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>{item.filling_score ?? 0}%</Text>
                    <Ionicons name="restaurant-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>משביע</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
      {isAuthenticated && (
        <>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
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
  results: {
    alignSelf: 'stretch',
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  authCard: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eeeeee',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fafafa',
  },
  inputField: {
    flex: 1,
    fontSize: 14,
  },
  eyeButton: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  loginButton: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#111111',
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 160,
    gap: 10,
  },
  feedContent: {
    paddingBottom: 120,
    gap: 16,
  },
  feedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  feedImageWrap: {
    position: 'relative',
    width: '100%',
    height: 260,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    overflow: 'hidden',
    margin: 8,
  },
  imageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
  },
  feedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  feedImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e5e7eb',
  },
  cameraBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageDateText: {
    position: 'absolute',
    top: 16,
    right: 56,
    color: '#E2E8F0',
    fontSize: 10,
    textAlign: 'right',
  },
  avatarBadge: {
    position: 'absolute',
    right: 12,
    top: 54,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  imageTextBlock: {
    position: 'absolute',
    top: 44,
    right: 56,
    left: 12,
    alignItems: 'flex-end',
  },
  imageDishText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  imageRestaurantText: {
    color: '#E2E8F0',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
  },
  orderBadge: {
    position: 'absolute',
    left: 12,
    bottom: -18,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  orderText: {
    marginTop: 2,
    fontSize: 12,
    color: '#F87171',
    fontWeight: '700',
  },
  favoritesHeader: {
    paddingTop: 2,
    paddingBottom: 2,
    alignItems: 'flex-end',
  },
  favoritesHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  ratingItem: {
    flex: 1,
    alignItems: 'center',
  },
  ratingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingValueInline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  ratingLabelInline: {
    marginTop: 2,
    fontSize: 12,
    color: '#94A3B8',
  },
  dishTitle: {
    display: 'none',
  },
  restaurantText: {
    display: 'none',
  },
  placeholderText: {
    color: '#666666',
    fontSize: 14,
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
  domainCard: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  domainLabel: {
    fontSize: 12,
    color: '#777777',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  domainValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#1a1a1a',
  },
  cardSubtitleMuted: {
    marginTop: 4,
    fontSize: 12,
    color: '#888888',
  },
});
