import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { Text, TextInput, useColorScheme } from 'react-native';
import AppHeader from '../components/AppHeader';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';
import { subscribeTheme } from '../lib/theme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [, setThemeTick] = useState(0);

  useEffect(() => {
    SplashScreen.preventAutoHideAsync();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadFonts = async () => {
      try {
        let heeboFonts: Record<string, number> | null = null;
        try {
          // Optional dependency: only load if installed.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          heeboFonts = require('@expo-google-fonts/heebo');
        } catch (err) {
          heeboFonts = null;
        }

        if (heeboFonts) {
          await Font.loadAsync({
            Heebo_400Regular: heeboFonts.Heebo_400Regular,
            Heebo_500Medium: heeboFonts.Heebo_500Medium,
            Heebo_600SemiBold: heeboFonts.Heebo_600SemiBold,
            Heebo_700Bold: heeboFonts.Heebo_700Bold,
          });
          Text.defaultProps = Text.defaultProps ?? {};
          Text.defaultProps.style = [
            { fontFamily: 'Heebo_400Regular' },
            Text.defaultProps.style,
          ];
          TextInput.defaultProps = TextInput.defaultProps ?? {};
          TextInput.defaultProps.style = [
            { fontFamily: 'Heebo_400Regular' },
            TextInput.defaultProps.style,
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
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
