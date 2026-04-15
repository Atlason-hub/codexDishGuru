import { supabase } from './supabase';

export const fetchFavoritesMap = async (userId: string) => {
  const { data, error } = await supabase
    .from('dish_favorites')
    .select('dish_association_id')
    .eq('user_id', userId);
  if (error) throw error;
  const map: Record<string, boolean> = {};
  (data ?? []).forEach((row: any) => {
    if (row?.dish_association_id) map[String(row.dish_association_id)] = true;
  });
  return map;
};

export const fetchOrderVendorForUser = async (userId: string) => {
  const { data: profile, error: profileError } = await supabase
    .from('AppUsers')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError || !profile?.company_id) {
    return null;
  }
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('order_vendor')
    .eq('id', profile.company_id)
    .maybeSingle();
  if (companyError) {
    return null;
  }
  return company?.order_vendor ?? null;
};

export const fetchUserAvatarMaps = async (userIds: string[]) => {
  if (userIds.length === 0) {
    return { avatars: {}, labels: {} } as {
      avatars: Record<string, string>;
      labels: Record<string, string>;
    };
  }

  const { data: profileData, error: profileError } = await supabase.rpc('get_user_profiles', {
    user_ids: userIds,
  });

  if (!profileError && Array.isArray(profileData)) {
    const avatars: Record<string, string> = {};
    const labels: Record<string, string> = {};
    (profileData ?? []).forEach((row: any) => {
      if (row?.user_id && row?.avatar_url) {
        avatars[String(row.user_id)] = String(row.avatar_url);
      }
      if (row?.user_id && row?.email_prefix) {
        labels[String(row.user_id)] = String(row.email_prefix);
      }
    });
    return { avatars, labels };
  }

  const { data, error: avatarError } = await supabase
    .from('AppUsers')
    .select('user_id, avatar_url')
    .in('user_id', userIds);

  if (avatarError) {
    return { avatars: {}, labels: {} };
  }

  const avatars: Record<string, string> = {};
  (data ?? []).forEach((row: any) => {
    if (row?.user_id && row?.avatar_url) {
      avatars[String(row.user_id)] = String(row.avatar_url);
    }
  });
  return { avatars, labels: {} };
};
