import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppState, LogBox, Text, TextInput, useColorScheme } from 'react-native';
import { Asset } from 'expo-asset';
import AppHeader from '../components/AppHeader';
import AppDialogHost from '../components/AppDialogHost';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import * as Font from 'expo-font';
import { deactivateKeepAwake } from 'expo-keep-awake';
import { subscribeTheme } from '../lib/theme';
import {
  clearInvalidStoredSession,
  startSupabaseAutoRefresh,
  stopSupabaseAutoRefresh,
  warmSupabaseSession,
} from '../lib/supabase';
import { LocaleProvider, useLocale } from '../lib/locale';
import { RATING_IMAGES } from '../lib/ratings';

function AppShell() {
  const colorScheme = useColorScheme();
  useLocale();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          header: () => <AppHeader />,
          animationDuration: 0,
          animation: 'none',
          fullScreenGestureEnabled: false,
          animationMatchesGesture: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="restaurant" options={{ animation: 'none' }} />
        <Stack.Screen name="dish" options={{ animation: 'none' }} />
        <Stack.Screen name="search" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="edit-dish" options={{ animation: 'none' }} />
        <Stack.Screen name="account" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="my-dishes" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="camera" options={{ headerShown: false }} />
        <Stack.Screen name="camera/result" options={{ headerShown: false }} />
        <Stack.Screen name="camera/details" options={{ headerShown: false }} />
      </Stack>
      <AppDialogHost />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [, setThemeTick] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const syncAuthOnForeground = async () => {
    try {
      await clearInvalidStoredSession();
      await warmSupabaseSession();
      await startSupabaseAutoRefresh();
    } catch {
      // Let screen-level session recovery continue without surfacing a redbox.
    }
  };

  useEffect(() => {
    LogBox.ignoreLogs([
      'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
    ]);
  }, []);

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
  }, []);

  useEffect(() => {
    deactivateKeepAwake();
    return () => {
      deactivateKeepAwake();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const prepareAuth = async () => {
      try {
        await syncAuthOnForeground();
      } finally {
        if (isMounted) {
          setAuthReady(true);
        }
      }
    };
    void prepareAuth();
    return () => {
      isMounted = false;
      void stopSupabaseAutoRefresh();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = /inactive|background/.test(appStateRef.current);
      if (wasInactive && nextState === 'active') {
        void syncAuthOnForeground();
      }

      if (/inactive|background/.test(nextState)) {
        void stopSupabaseAutoRefresh();
      }

      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadFonts = async () => {
      try {
        let heeboFonts: Record<string, number> | null = null;
        try {
          const loaded = await import('@expo-google-fonts/heebo');
          heeboFonts = {
            Heebo_400Regular: loaded.Heebo_400Regular,
            Heebo_500Medium: loaded.Heebo_500Medium,
            Heebo_600SemiBold: loaded.Heebo_600SemiBold,
            Heebo_700Bold: loaded.Heebo_700Bold,
          };
        } catch {
          heeboFonts = null;
        }

        if (heeboFonts) {
          await Font.loadAsync({
            Heebo_400Regular: heeboFonts.Heebo_400Regular,
            Heebo_500Medium: heeboFonts.Heebo_500Medium,
            Heebo_600SemiBold: heeboFonts.Heebo_600SemiBold,
            Heebo_700Bold: heeboFonts.Heebo_700Bold,
          });
          const DefaultText = Text as typeof Text & { defaultProps?: { style?: unknown } };
          DefaultText.defaultProps = DefaultText.defaultProps ?? {};
          DefaultText.defaultProps.style = [
            { fontFamily: 'Heebo_400Regular' },
            DefaultText.defaultProps.style,
          ];
          const DefaultTextInput = TextInput as typeof TextInput & {
            defaultProps?: { style?: unknown };
          };
          DefaultTextInput.defaultProps = DefaultTextInput.defaultProps ?? {};
          DefaultTextInput.defaultProps.style = [
            { fontFamily: 'Heebo_400Regular' },
            DefaultTextInput.defaultProps.style,
          ];
        }
      } finally {
        if (isMounted) {
          setFontsLoaded(true);
          SplashScreen.hideAsync();
        }
      }
    };
    loadFonts();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTheme(() => {
      setThemeTick((value) => value + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void Asset.loadAsync(RATING_IMAGES.filter((source): source is number => typeof source === 'number'));
  }, []);

  if (!fontsLoaded || !authReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LocaleProvider>
        <AppShell />
      </LocaleProvider>
    </GestureHandlerRootView>
  );
}
