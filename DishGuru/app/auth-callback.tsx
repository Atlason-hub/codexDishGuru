import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseAuthRedirectUrl } from '../lib/authRedirect';
import { useLocale } from '../lib/locale';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const handledUrlRef = useRef<string | null>(null);
  const { setLocale, t } = useLocale();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  const handleIncomingUrl = async (incomingUrl: string | null) => {
    if (!incomingUrl || handledUrlRef.current === incomingUrl) return;
    handledUrlRef.current = incomingUrl;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const parsed = parseAuthRedirectUrl(incomingUrl);
      if (parsed.lang) {
        await setLocale(parsed.lang);
      }
      if (parsed.errorDescription) {
        setErrorMessage(parsed.errorDescription);
        return;
      }
      if (parsed.confirmed && parsed.type === 'email') {
        router.replace('/?emailConfirmed=1');
        return;
      }
      if (!parsed.accessToken || !parsed.refreshToken) {
        setErrorMessage(t('authLinkInvalid'));
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error) {
        setErrorMessage(error.message || t('authLinkInvalid'));
        return;
      }
      if (parsed.type === 'recovery') {
        router.replace('/reset-password');
        return;
      }
      router.replace('/');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    void handleIncomingUrl(url);
  }, [url]);

  useEffect(() => {
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      await handleIncomingUrl(initialUrl);
    })();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!handledUrlRef.current) {
        setIsProcessing(false);
        setErrorMessage(t('authLinkInvalid'));
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [t]);

  useEffect(() => {
    return () => {
      handledUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      if (!url) return;
      const parsed = parseAuthRedirectUrl(url);
      if (parsed.accessToken || parsed.refreshToken || parsed.errorDescription) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (parsed.type === 'recovery') {
          router.replace('/reset-password');
        } else {
          router.replace('/');
        }
      }
    })();
  }, [router, url]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : isProcessing ? (
          <>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text style={styles.message}>{t('authCallbackLoading')}</Text>
          </>
        ) : null}
        {!errorMessage && !isProcessing ? (
          <Text style={styles.errorText}>{t('authLinkInvalid')}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 14,
  },
  message: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
  errorText: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 28,
    textAlign: 'center',
  },
});
