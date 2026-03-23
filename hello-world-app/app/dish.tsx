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
  const restaurantIdParam =
    typeof params.restaurantId === 'string' ? Number(params.restaurantId) : null;
  const restaurantName =
    typeof params.restaurantName === 'string' ? params.restaurantName : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

  const loadDishAssociations = async () => {
    if (!dishName) {
      setError('Missing dish name');
      setDishAssociations([]);
      setAvgScores(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let query = supabase
        .from('dish_associations')
        .select(
          'id, dish_id, image_url, dish_name, restaurant_name, restaurant_id, tasty_score, fast_score, filling_score, created_at'
        )
        .ilike('dish_name', dishName)
        .order('created_at', { ascending: false });

      if (restaurantIdParam) {
        query = query.eq('restaurant_id', restaurantIdParam);
      } else if (restaurantName) {
        query = query.ilike('restaurant_name', restaurantName);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      const list = (data as DishAssociation[]) ?? [];
      setDishAssociations(list);
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
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const cachedAvatar = await loadCachedAvatar();
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      if (data.session?.user?.id) {
        await loadFavorites(data.session.user.id);
      }
      await loadDishAssociations();
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
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
  }, [dishName, restaurantIdParam, restaurantName]);

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
                <Text style={styles.headerTitle}>{dishName || 'מנה'}</Text>
                <Text style={styles.headerSubtitle}>
                  {restaurantName || (restaurantIdParam ? `מסעדה ${restaurantIdParam}` : '')}
                </Text>
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
                <Ionicons name="camera" size={18} color="#E2E8F0" />
              </Pressable>
              <Pressable style={styles.heartBadge} onPress={() => toggleFavorite(item.id)}>
                <Ionicons
                  name={favorites[item.id] ? 'heart' : 'heart-outline'}
                  size={18}
                  color="#E2E8F0"
                />
              </Pressable>
              <Text style={styles.imageDateText}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
              </Text>
              <View style={styles.avatarBadge}>
                {avatarUrl ? (
                  <CachedLogo uri={avatarUrl} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={16} color="#111111" />
                )}
              </View>
              <View style={styles.imageTextBlock}>
                <Text style={styles.imageDishText} numberOfLines={1} ellipsizeMode="tail">
                  {item.dish_name ?? 'מנה'}
                </Text>
                <Text style={styles.imageRestaurantText} numberOfLines={1} ellipsizeMode="tail">
                  {item.restaurant_name ??
                    (item.restaurant_id ? `מסעדה ${item.restaurant_id}` : 'מסעדה')}
                </Text>
              </View>
              <View style={styles.orderBadge}>
                <Ionicons name="cart-outline" size={24} color="#F87171" />
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
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
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
    height: 90,
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
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageDateText: {
    position: 'absolute',
    top: 16,
    right: 56,
    color: '#E2E8F0',
    fontSize: 10,
    textAlign: 'right',
  },
  avatarBadge: {
    position: 'absolute',
    right: 12,
    top: 54,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  imageTextBlock: {
    position: 'absolute',
    top: 44,
    right: 56,
    left: 12,
    alignItems: 'flex-end',
  },
  imageDishText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  imageRestaurantText: {
    color: '#E2E8F0',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
  },
  orderBadge: {
    position: 'absolute',
    left: 12,
    bottom: -18,
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
  },
  orderText: {
    marginTop: 2,
    fontSize: 12,
    color: '#F87171',
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
