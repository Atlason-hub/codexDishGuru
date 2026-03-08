import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

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
  const [debugEmailDomain, setDebugEmailDomain] = useState<string | null>(null);
  const [debugCompanyDomain, setDebugCompanyDomain] = useState<string | null>(null);
  const [debugCompanyId, setDebugCompanyId] = useState<string | null>(null);
  const [debugAuthError, setDebugAuthError] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

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

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Please allow camera access to take a photo.');
      return;
    }
    await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setSessionChecked(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
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
      setDebugEmailDomain(domainPart || null);
      setDebugCompanyDomain(null);
      setDebugCompanyId(null);
      if (!domainPart) {
        throw new Error('Email domain missing');
      }
      const { data: companyMatch, error: companyError } = await supabase
        .from('companies')
        .select('id, domain')
        .ilike('domain', domainPart)
        .limit(1)
        .maybeSingle();
      if (companyError) {
        throw companyError;
      }
      if (!companyMatch) {
        throw new Error('No company matches email domain');
      }
      setDebugCompanyDomain(companyMatch.domain ?? null);
      setDebugCompanyId(companyMatch.id ?? null);
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
      });
      if (error) {
        throw error;
      }
      const supabaseUserId = data.user?.id;
      if (supabaseUserId && companyMatch.id) {
        const { error: profileError } = await supabase.from('AppUsers').insert({
          user_id: supabaseUserId,
          email: trimmedEmail,
          company_id: companyMatch.id,
        });
        if (profileError) {
          throw profileError;
        }
      }
      Alert.alert('Check your email', 'Confirm your email to complete signup.');
      setShowSignup(false);
      setPass('');
      setConfirmPass('');
    } catch (err) {
      const authApiError =
        err && typeof err === 'object' && 'name' in err ? (err as { [k: string]: any }) : null;
      const message = authApiError?.message ?? (err instanceof Error ? err.message : 'Signup failed.');
      setDebugAuthError(
        JSON.stringify(
          {
            message: authApiError?.message ?? 'n/a',
            details: authApiError?.details ?? null,
            hint: authApiError?.hint ?? null,
            status: authApiError?.status ?? null,
            code: authApiError?.code ?? null,
          },
          null,
          2
        )
      );
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => {}}>
          <Ionicons name="menu" size={24} color="#111111" />
        </Pressable>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>DishGuru</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={openCamera}>
          <Ionicons name="camera" size={24} color="#111111" />
        </Pressable>
      </View>
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
          {(debugEmailDomain !== null || debugCompanyDomain !== null) && (
            <View style={styles.debugCard}>
              <Text style={styles.debugLabel}>Email domain</Text>
              <Text style={styles.debugValue}>{debugEmailDomain ?? 'not provided'}</Text>
              <Text style={styles.debugLabel}>Matched company domain</Text>
              <Text style={styles.debugValue}>
                {debugCompanyDomain ?? 'no matching company domain found'}
              </Text>
              {debugCompanyId && (
                <>
                  <Text style={styles.debugLabel}>Company ID</Text>
                  <Text style={styles.debugValue}>{debugCompanyId}</Text>
                </>
              )}
            </View>
          )}
          {debugAuthError && (
            <View style={styles.debugCard}>
              <Text style={styles.debugLabel}>Raw Supabase error</Text>
              <Text style={styles.debugValue}>{debugAuthError}</Text>
            </View>
          )}
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
                    Alert.alert('Menu link not available', 'This restaurant did not include a menu URL.');
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
  debugCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  debugLabel: {
    fontSize: 12,
    color: '#888888',
    textTransform: 'uppercase',
  },
  debugValue: {
    fontSize: 14,
    color: '#111111',
    marginBottom: 6,
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
});
