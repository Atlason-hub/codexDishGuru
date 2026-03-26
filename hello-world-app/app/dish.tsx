import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CachedLogo from '../components/CachedLogo';
import { supabase } from '../lib/supabase';
import { loadCachedAvatar } from '../lib/avatar';

type DishAssociation = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  fast_score: number | null;
  filling_score: number | null;
  created_at: string | null;
};

export default function DishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const dishName = typeof params.dishName === 'string' ? params.dishName : '';
  const dishQuery = typeof params.dishQuery === 'string' ? params.dishQuery : '';
  const dishIdParam =
    typeof params.dishId === 'string' && params.dishId.length > 0
      ? Number(params.dishId)
      : null;
  const restaurantIdParam =
    typeof params.restaurantId === 'string' ? Number(params.restaurantId) : null;
  const restaurantName =
    typeof params.restaurantName === 'string' ? params.restaurantName : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>([]);
  const [userAvatars, setUserAvatars] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [avgScores, setAvgScores] = useState<{
    tasty: number;
    fast: number;
    filling: number;
  } | null>(null);

  const loadFavorites = async (userId: string) => {
    try {
      const { data, error: favError } = await supabase
        .from('dish_favorites')
        .select('dish_association_id')
        .eq('user_id', userId);
      if (favError) throw favError;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((row: any) => {
        if (row?.dish_association_id) map[String(row.dish_association_id)] = true;
      });
      setFavorites(map);
    } catch (err) {
      console.log('[FAVORITES_LOAD_ERROR]:', err);
    }
  };

  const toggleFavorite = async (dishAssociationId: string) => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    const isFav = Boolean(favorites[dishAssociationId]);
    setFavorites((prev) => ({ ...prev, [dishAssociationId]: !isFav }));
    try {
      if (isFav) {
        const { error } = await supabase
          .from('dish_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('dish_association_id', dishAssociationId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dish_favorites').insert({
          user_id: userId,
          dish_association_id: dishAssociationId,
          created_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    } catch (err) {
      console.log('[FAVORITE_TOGGLE_ERROR]:', err);
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  };

  const loadUserAvatars = async (items: DishAssociation[]) => {
    const ids = Array.from(
      new Set(items.map((item) => item.user_id).filter(Boolean) as string[])
    );
    if (ids.length === 0) {
      setUserAvatars({});
      return;
    }
    const { data: profileData, error: profileError } = await supabase.rpc('get_user_profiles', {
      user_ids: ids,
    });
    if (!profileError && Array.isArray(profileData)) {
      const map: Record<string, string> = {};
      (profileData ?? []).forEach((row: any) => {
        if (row?.user_id && row?.avatar_url) {
          map[String(row.user_id)] = String(row.avatar_url);
        }
      });
      setUserAvatars(map);
      return;
    }
    const { data, error: avatarError } = await supabase
      .from('AppUsers')
      .select('user_id, avatar_url')
      .in('user_id', ids);
    if (avatarError) {
      console.log('[AVATAR_LOAD_ERROR]:', avatarError);
      setUserAvatars({});
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((row: any) => {
      if (row?.user_id && row?.avatar_url) {
        map[String(row.user_id)] = String(row.avatar_url);
      }
    });
    setUserAvatars(map);
  };

  const loadDishAssociations = async () => {
    if (!dishName && !dishQuery && dishIdParam === null) {
      setError('חסר שם מנה');
      setDishAssociations([]);
      setAvgScores(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      let list: DishAssociation[] = [];

      if (userId) {
        const { data: profile } = await supabase
          .from('AppUsers')
          .select('company_id')
          .eq('user_id', userId)
          .maybeSingle();
        const companyId = profile?.company_id ?? null;
        if (companyId) {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'get_company_dishes',
            { company_id: companyId }
          );
          if (rpcError) throw rpcError;
          const allRows = (rpcData as DishAssociation[]) ?? [];
          const normalizedQuery = dishQuery.trim().toLowerCase();
          list = allRows.filter((row) => {
            if (dishIdParam !== null) {
              return row.dish_id === dishIdParam;
            }
            if (normalizedQuery) {
              return (row.dish_name ?? '').toLowerCase().includes(normalizedQuery);
            }
            return (row.dish_name ?? '').toLowerCase() === dishName.toLowerCase();
          });
        }
      }

      if (list.length === 0) {
        let query = supabase
          .from('dish_associations')
          .select(
            'id, user_id, dish_id, image_url, dish_name, restaurant_name, restaurant_id, tasty_score, fast_score, filling_score, created_at'
          )
          .order('created_at', { ascending: false });

        if (dishIdParam !== null) {
          query = query.eq('dish_id', dishIdParam);
        } else if (dishQuery.trim()) {
          query = query.ilike('dish_name', `%${dishQuery.trim()}%`);
        } else if (dishName) {
          query = query.ilike('dish_name', dishName);
        }

        if (!dishQuery.trim()) {
          if (restaurantIdParam) {
            query = query.eq('restaurant_id', restaurantIdParam);
          } else if (restaurantName) {
            query = query.ilike('restaurant_name', restaurantName);
          }
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;
        list = (data as DishAssociation[]) ?? [];
      }

      list.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
      setDishAssociations(list);
      await loadUserAvatars(list);
      if (list.length > 0) {
        let tastySum = 0;
        let tastyCount = 0;
        let fastSum = 0;
        let fastCount = 0;
        let fillingSum = 0;
        let fillingCount = 0;
        list.forEach((row) => {
          if (typeof row.tasty_score === 'number') {
            tastySum += row.tasty_score;
            tastyCount += 1;
          }
          if (typeof row.fast_score === 'number') {
            fastSum += row.fast_score;
            fastCount += 1;
          }
          if (typeof row.filling_score === 'number') {
            fillingSum += row.filling_score;
            fillingCount += 1;
          }
        });
        setAvgScores({
          tasty: tastyCount ? tastySum / tastyCount : 0,
          fast: fastCount ? fastSum / fastCount : 0,
          filling: fillingCount ? fillingSum / fillingCount : 0,
        });
      } else {
        setAvgScores(null);
      }
    } catch (err) {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setCurrentUserId(data.session?.user?.id ?? null);
      const cachedAvatar = await loadCachedAvatar(data.session?.user?.id ?? null);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      if (data.session?.user?.id) {
        await loadFavorites(data.session.user.id);
      }
      await loadDishAssociations();
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
      if (session?.user?.id) {
        loadFavorites(session.user.id);
      } else {
        setFavorites({});
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [dishName, dishQuery, dishIdParam, restaurantIdParam, restaurantName]);

  const headerRestaurant =
    restaurantName ||
    (dishAssociations.length > 0
      ? dishAssociations[0].restaurant_name ?? null
      : restaurantIdParam
        ? `מסעדה ${restaurantIdParam}`
        : null);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={dishAssociations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.feedContent}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <Pressable style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={18} color="#111111" />
              </Pressable>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>{dishQuery || dishName || 'מנה'}</Text>
                <Text style={styles.headerSubtitle}>{headerRestaurant ?? ''}</Text>
              </View>
            </View>
            {avgScores ? (
              <View style={styles.avgCard}>
                <Text style={styles.avgHeader}>דירוג ממוצע</Text>
                <View style={styles.ratingRow}>
                  <View style={styles.ratingItem}>
                    <View style={styles.ratingTopRow}>
                      <Text style={styles.ratingValueInline}>
                        {Math.round(avgScores.tasty)}%
                      </Text>
                      <Ionicons name="fast-food-outline" size={18} color="#94A3B8" />
                    </View>
                    <Text style={styles.ratingLabelInline}>טעים</Text>
                  </View>
                  <View style={styles.ratingItem}>
                    <View style={styles.ratingTopRow}>
                      <Text style={styles.ratingValueInline}>
                        {Math.round(avgScores.fast)}%
                      </Text>
                      <Ionicons name="rocket-outline" size={18} color="#94A3B8" />
                    </View>
                    <Text style={styles.ratingLabelInline}>מהיר</Text>
                  </View>
                  <View style={styles.ratingItem}>
                    <View style={styles.ratingTopRow}>
                      <Text style={styles.ratingValueInline}>
                        {Math.round(avgScores.filling)}%
                      </Text>
                      <Ionicons name="restaurant-outline" size={18} color="#94A3B8" />
                    </View>
                    <Text style={styles.ratingLabelInline}>משביע</Text>
                  </View>
                </View>
              </View>
            ) : null}
            {loading ? (
              <View style={styles.results}>
                <ActivityIndicator size="large" />
              </View>
            ) : error ? (
              <View style={styles.results}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View style={styles.results}>
              <Text style={styles.placeholderText}>אין מנות להצגה</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.feedCard}>
            <View style={styles.feedImageWrap}>
              {item.image_url ? (
                <CachedLogo uri={item.image_url} style={styles.feedImage} />
              ) : (
                <View style={styles.feedImagePlaceholder} />
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.0)']}
                style={styles.imageGradient}
              />
              <Pressable
                style={styles.cameraBadge}
                hitSlop={8}
                onPress={() =>
                  router.push({
                    pathname: '/camera',
                    params: {
                      restaurantId: item.restaurant_id ? String(item.restaurant_id) : '',
                      restaurantName: item.restaurant_name ?? '',
                      dishId: item.dish_id !== null ? String(item.dish_id) : '',
                      dishName: item.dish_name ?? '',
                    },
                  })
                }
              >
                <Ionicons name="camera" size={18} color="#111111" />
              </Pressable>
              <Pressable style={styles.heartBadge} hitSlop={8} onPress={() => toggleFavorite(item.id)}>
                <Ionicons
                  name={favorites[item.id] ? 'heart' : 'heart-outline'}
                  size={18}
                  color="#111111"
                />
              </Pressable>
              <Text style={styles.imageDateText}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
              </Text>
              <View style={styles.avatarBadge}>
                {(() => {
                  const itemAvatar = item.user_id ? userAvatars[item.user_id] : null;
                  const resolvedAvatar =
                    item.user_id && item.user_id === currentUserId
                      ? itemAvatar ?? avatarUrl
                      : itemAvatar;
                  return resolvedAvatar ? (
                    <CachedLogo uri={resolvedAvatar} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={16} color="#111111" />
                  );
                })()}
              </View>
              <View style={styles.imageTextBlock}>
                <Text style={styles.imageDishText} numberOfLines={1} ellipsizeMode="tail">
                  {item.dish_name ?? 'מנה'}
                </Text>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/restaurant',
                      params: {
                        restaurantId: item.restaurant_id ? String(item.restaurant_id) : '',
                        restaurantName: item.restaurant_name ?? '',
                      },
                    })
                  }
                >
                  <Text style={styles.imageRestaurantText} numberOfLines={1} ellipsizeMode="tail">
                    {item.restaurant_name ??
                      (item.restaurant_id ? `מסעדה ${item.restaurant_id}` : 'מסעדה')}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.orderBadge}>
                <Ionicons name="cart-outline" size={28} color="#9e211c" />
                <Text style={styles.orderText}>הזמן</Text>
              </View>
            </View>
            <View style={styles.ratingRow}>
              <View style={styles.ratingItem}>
                <View style={styles.ratingTopRow}>
                  <Text style={styles.ratingValueInline}>{item.tasty_score ?? 0}%</Text>
                  <Ionicons name="fast-food-outline" size={18} color="#94A3B8" />
                </View>
                <Text style={styles.ratingLabelInline}>טעים</Text>
              </View>
              <View style={styles.ratingItem}>
                <View style={styles.ratingTopRow}>
                  <Text style={styles.ratingValueInline}>{item.fast_score ?? 0}%</Text>
                  <Ionicons name="rocket-outline" size={18} color="#94A3B8" />
                </View>
                <Text style={styles.ratingLabelInline}>מהיר</Text>
              </View>
              <View style={styles.ratingItem}>
                <View style={styles.ratingTopRow}>
                  <Text style={styles.ratingValueInline}>{item.filling_score ?? 0}%</Text>
                  <Ionicons name="restaurant-outline" size={18} color="#94A3B8" />
                </View>
                <Text style={styles.ratingLabelInline}>משביע</Text>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 10,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  results: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  avgCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    marginBottom: 10,
  },
  avgHeader: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginBottom: 6,
  },
  feedContent: {
    paddingBottom: 120,
    gap: 16,
  },
  feedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  feedImageWrap: {
    position: 'relative',
    width: '100%',
    height: 260,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    overflow: 'hidden',
    margin: 8,
  },
  imageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 2,
  },
  feedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  feedImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e5e7eb',
  },
  cameraBadge: {
    position: 'absolute',
    top: 64,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  heartBadge: {
    position: 'absolute',
    top: 112,
    left: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  imageDateText: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontSize: 10,
    color: '#1f2937',
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
    textAlign: 'left',
    zIndex: 6,
  },
  avatarBadge: {
    position: 'absolute',
    right: 16,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 7,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  imageTextBlock: {
    position: 'absolute',
    top: 16,
    right: 12,
    left: 12,
    alignItems: 'flex-end',
    paddingLeft: 84,
    zIndex: 6,
  },
  imageDishText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
  },
  imageRestaurantText: {
    color: '#E2E8F0',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 2,
    writingDirection: 'rtl',
  },
  orderBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 6,
  },
  orderText: {
    marginTop: 2,
    fontSize: 13,
    color: '#9e211c',
    fontWeight: '700',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  ratingItem: {
    flex: 1,
    alignItems: 'center',
  },
  ratingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingValueInline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  ratingLabelInline: {
    marginTop: 2,
    fontSize: 12,
    color: '#94A3B8',
  },
  placeholderText: {
    color: '#666666',
    fontSize: 14,
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
});
