import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://snbreqnndprgbfgiiynd.supabase.co';
const supabaseAnonKey = 'sb_publishable_MhAe1ld13gUdTherOMkjKQ_ySHA_TtZ';

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

const rawGetSession = supabase.auth.getSession.bind(supabase.auth);
const rawGetUser = supabase.auth.getUser.bind(supabase.auth);
const rawSignOut = supabase.auth.signOut.bind(supabase.auth);

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
