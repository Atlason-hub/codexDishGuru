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
