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

export async function clearInvalidStoredSession() {
  try {
    const { error } = await supabase.auth.getSession();
    if (error && isInvalidRefreshTokenError(error.message)) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isInvalidRefreshTokenError(message)) {
      await supabase.auth.signOut({ scope: 'local' });
    }
  }
}
