import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Text, TextInput, useColorScheme } from 'react-native';
import AppHeader from '../components/AppHeader';
import AppDialogHost from '../components/AppDialogHost';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { deactivateKeepAwake } from 'expo-keep-awake';
import { subscribeTheme } from '../lib/theme';
import { clearInvalidStoredSession } from '../lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [, setThemeTick] = useState(0);

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
    clearInvalidStoredSession();
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

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ header: () => <AppHeader /> }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="camera" options={{ headerShown: false }} />
          <Stack.Screen name="camera/result" options={{ headerShown: false }} />
          <Stack.Screen name="camera/details" options={{ headerShown: false }} />
        </Stack>
        <AppDialogHost />
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
