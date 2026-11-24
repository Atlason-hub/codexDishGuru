import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

const INSTALL_ID_KEY = 'dishguru:error-install-id:v1';
const recentReports = new Map<string, number>();

type ErrorContext = {
  screen?: string;
  action?: string;
  context?: Record<string, unknown>;
};

const getInstallId = async () => {
  const saved = await AsyncStorage.getItem(INSTALL_ID_KEY);
  if (saved) return saved;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(INSTALL_ID_KEY, created);
  return created;
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  return { message: typeof error === 'string' ? error : 'Unknown application error', stack: null };
};

export const reportAppError = async (error: unknown, details: ErrorContext = {}) => {
  try {
    const normalized = normalizeError(error);
    const localKey = `${normalized.message}|${details.screen ?? ''}|${details.action ?? ''}`;
    const now = Date.now();
    if (now - (recentReports.get(localKey) ?? 0) < 30_000) return;
    recentReports.set(localKey, now);

    const [{ data }, clientInstallId] = await Promise.all([
      supabase.auth.getSession(),
      getInstallId(),
    ]);
    const accessToken = data.session?.access_token?.trim() || SUPABASE_ANON_KEY;
    await fetch(`${SUPABASE_URL}/functions/v1/capture-app-error`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: normalized.message.slice(0, 2000),
        stack: normalized.stack?.slice(0, 8000) ?? null,
        screen: details.screen ?? null,
        action: details.action ?? null,
        context: details.context ?? {},
        clientInstallId,
        appVersion: Constants.expoConfig?.version ?? null,
        buildVersion: Constants.nativeBuildVersion ?? null,
        expoVersion: Constants.expoConfig?.sdkVersion ?? null,
        platform: Platform.OS,
        osVersion: String(Platform.Version),
      }),
    });
  } catch {
    // Error reporting must never interfere with the app itself.
  }
};

export const installGlobalErrorReporter = () => {
  const errorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void);
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return () => {};

  const previousHandler = errorUtils.getGlobalHandler?.();
  const handler = (error: Error, isFatal?: boolean) => {
    void reportAppError(error, {
      action: isFatal ? 'fatal-runtime-error' : 'runtime-error',
      context: { isFatal: Boolean(isFatal) },
    });
    previousHandler?.(error, isFatal);
  };
  errorUtils.setGlobalHandler(handler);
  return () => {
    if (previousHandler) errorUtils.setGlobalHandler?.(previousHandler);
  };
};
