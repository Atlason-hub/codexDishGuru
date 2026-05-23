import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://pcamdhbgjbsnfwicyiqa.supabase.co';
const supabaseAnonKey = 'sb_publishable_7JyR16-ZDFnkOPYMHZrczA_oE10ympy';
const expectedJwtIssuer = `${supabaseUrl}/auth/v1`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});


const isInvalidRefreshTokenError = (message: string | undefined) =>
  typeof message === 'string' && /invalid refresh token|refresh token not found/i.test(message);

const decodeJwtPayload = (token: string | undefined | null) => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json =
      globalThis.atob?.(padded) ??
      Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as { iss?: string };
  } catch {
    return null;
  }
};

const sessionMatchesCurrentProject = (session: { access_token?: string } | null | undefined) => {
  const payload = decodeJwtPayload(session?.access_token);
  const issuer = payload?.iss?.replace(/\/+$/, '') ?? null;
  return issuer === expectedJwtIssuer;
};

const rawGetSession = supabase.auth.getSession.bind(supabase.auth);
const rawGetUser = supabase.auth.getUser.bind(supabase.auth);
const rawSignOut = supabase.auth.signOut.bind(supabase.auth);
const rawRefreshSession = supabase.auth.refreshSession.bind(supabase.auth);

let invalidSessionRecoveryPromise: Promise<void> | null = null;

const recoverInvalidStoredSession = async () => {
  if (!invalidSessionRecoveryPromise) {
    invalidSessionRecoveryPromise = (async () => {
      try {
        await rawSignOut({ scope: 'local' });
      } catch {
        // Ignore local cleanup failures and let the caller proceed signed out.
      }
    })().finally(() => {
      invalidSessionRecoveryPromise = null;
    });
  }

  await invalidSessionRecoveryPromise;
};

const emptySessionResult = {
  data: { session: null },
  error: null,
} as Awaited<ReturnType<typeof rawGetSession>>;

const emptyUserResult = {
  data: { user: null },
  error: null,
} as unknown as Awaited<ReturnType<typeof rawGetUser>>;

supabase.auth.getSession = (async () => {
  try {
    const result = await rawGetSession();
    if (isInvalidRefreshTokenError(result.error?.message)) {
      await recoverInvalidStoredSession();
      return emptySessionResult;
    }
    if (result.data.session && !sessionMatchesCurrentProject(result.data.session)) {
      await recoverInvalidStoredSession();
      return emptySessionResult;
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInvalidRefreshTokenError(message)) {
      await recoverInvalidStoredSession();
      return emptySessionResult;
    }
    throw error;
  }
}) as typeof supabase.auth.getSession;

supabase.auth.getUser = (async (jwt?: string) => {
  try {
    const result = await rawGetUser(jwt);
    if (isInvalidRefreshTokenError(result.error?.message)) {
      await recoverInvalidStoredSession();
      return emptyUserResult;
    }
    if (result.data.user && jwt && !sessionMatchesCurrentProject({ access_token: jwt })) {
      await recoverInvalidStoredSession();
      return emptyUserResult;
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInvalidRefreshTokenError(message)) {
      await recoverInvalidStoredSession();
      return emptyUserResult;
    }
    throw error;
  }
}) as typeof supabase.auth.getUser;

export async function clearInvalidStoredSession() {
  try {
    const { error } = await rawGetSession();
    if (error && isInvalidRefreshTokenError(error.message)) {
      await recoverInvalidStoredSession();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInvalidRefreshTokenError(message)) {
      await recoverInvalidStoredSession();
    }
  }
}

let autoRefreshStarted = false;

export async function getCurrentAuthUser() {
  const { data } = await supabase.auth.getSession();
  const sessionUser = data.session?.user ?? null;
  if (sessionUser) {
    return sessionUser;
  }

  try {
    const userResult = await supabase.auth.getUser();
    return userResult.data.user ?? null;
  } catch {
    return null;
  }
}

export async function warmSupabaseSession() {
  const sessionResult = await supabase.auth.getSession();
  const session = sessionResult.data.session;
  if (!session?.refresh_token) {
    return session;
  }

  try {
    const refreshResult = await rawRefreshSession({
      refresh_token: session.refresh_token,
    });
    if (isInvalidRefreshTokenError(refreshResult.error?.message)) {
      await recoverInvalidStoredSession();
      return null;
    }
    return refreshResult.data.session ?? session;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInvalidRefreshTokenError(message)) {
      await recoverInvalidStoredSession();
      return null;
    }
    return session;
  }
}

export async function startSupabaseAutoRefresh() {
  if (autoRefreshStarted) return;
  autoRefreshStarted = true;
  await supabase.auth.startAutoRefresh();
}

export async function stopSupabaseAutoRefresh() {
  if (!autoRefreshStarted) return;
  autoRefreshStarted = false;
  await supabase.auth.stopAutoRefresh();
}
