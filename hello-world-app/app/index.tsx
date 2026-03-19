import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import CachedLogo from '../components/CachedLogo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { loadCachedLogo } from '../lib/logo';

const SUPABASE_URL = 'https://snbreqnndprgbfgiiynd.supabase.co';

type Restaurant = {
  RestaurantId: number;
  RestaurantName: string;
  StartOrderURL?: string;
};

const extractNamesFromXml = (xml: string): Restaurant[] => {
  const results: Restaurant[] = [];
  const pattern = /<RestaurantName>([\s\S]*?)<\/RestaurantName>/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(xml)) !== null) {
    const raw = match[1].trim();
    if (raw.length > 0) {
      results.push({ RestaurantId: index + 1, RestaurantName: raw });
      index += 1;
    }
  }
  return results;
};

export default function HomeScreen() {
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
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userEmailDomain, setUserEmailDomain] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyFetchError, setCompanyFetchError] = useState<string | null>(null);
  const [companyDebugJson, setCompanyDebugJson] = useState<string | null>(null);

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

  const runApi = async () => {
    try {
      setLoading(true);
      setError(null);
      setRestaurants([]);
      const response = await fetch(
        'https://www.10bis.co.il/api/SearchResListWithOrderHistoryAndPopularDishesAndRes?cityId=14&streetId=54730',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        const list: Restaurant[] = Array.isArray(data?.Data?.ResList)
          ? data.Data.ResList
              .map((item: any) => ({
                RestaurantId: item?.RestaurantId,
                RestaurantName: item?.RestaurantName,
                StartOrderURL: item?.StartOrderURL,
              }))
              .filter(
                (item: Restaurant) =>
                  typeof item.RestaurantName === 'string' && item.RestaurantName.length > 0
              )
          : [];
        setRestaurants(list);
      } catch {
        setRestaurants(extractNamesFromXml(text));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      const sessionEmail = session?.user?.email ?? null;
      setUserEmail(sessionEmail);
      setUserEmailDomain(getEmailDomain(sessionEmail));
      if (session?.user?.id) {
        fetchCompanyLogoForUser(session.user.id, getEmailDomain(sessionEmail));
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
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
          <View style={styles.results}>
            <Pressable style={styles.signOutButton} onPress={signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
            {(companyLogoUrl || companyLogoPath) && (
              <View style={styles.logoCenterBox}>
                {companyLogoUrl && <CachedLogo uri={companyLogoUrl} style={styles.logoCenterImage} />}
                <Text style={styles.logoUrlText} numberOfLines={1} ellipsizeMode="middle">
                  {companyLogoPath ?? companyLogoUrl}
                </Text>
              </View>
            )}
            {loading && <ActivityIndicator size="large" />}
            {!loading && error && <Text style={styles.errorText}>{error}</Text>}
            {!loading && !error && restaurants.length > 0 && (
              <FlatList
                data={restaurants}
                keyExtractor={(item) => String(item.RestaurantId)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.card}
                    onPress={() => {
                      if (item.StartOrderURL) {
                        Linking.openURL(item.StartOrderURL);
                      } else {
                        Alert.alert(
                          'Menu link not available',
                          'This restaurant did not include a menu URL.'
                        );
                      }
                    }}
                  >
                    <Text style={styles.cardTitle}>{item.RestaurantName}</Text>
                    {item.StartOrderURL ? (
                      <Text style={styles.cardSubtitle}>Open menu</Text>
                    ) : (
                      <Text style={styles.cardSubtitleMuted}>Menu link not available</Text>
                    )}
                  </Pressable>
                )}
              />
            )}
            {!loading && !error && restaurants.length === 0 && (
              <Text style={styles.placeholderText}>Tap “Run API” to load data.</Text>
            )}
          </View>
        )}
      </ScrollView>
      {isAuthenticated && (
        <>
          <Pressable style={[styles.button, styles.runApiButton]} onPress={runApi}>
            <Text style={styles.buttonText}>Run API</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.refreshButton]}
            onPress={() => {
              setError(null);
              setRestaurants([]);
            }}
          >
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
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
  logoCenterBox: {
    alignItems: 'center',
    marginBottom: 12,
  },
  logoCenterImage: {
    width: 180,
    height: 60,
    resizeMode: 'contain',
    marginBottom: 4,
  },
  logoUrlText: {
    fontSize: 12,
    color: '#6B7280',
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
  signOutButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dddddd',
    marginBottom: 8,
  },
  signOutText: {
    fontSize: 12,
    color: '#111111',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 160,
    gap: 10,
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
  button: {
    position: 'absolute',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111111',
    backgroundColor: '#ffffff',
  },
  runApiButton: {
    bottom: 88,
  },
  refreshButton: {
    bottom: 32,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 200,
  },
});
