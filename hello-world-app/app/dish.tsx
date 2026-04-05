import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadCachedAvatar } from '../lib/avatar';
import DishCard from '../components/DishCard';
import { theme } from '../lib/theme';

type DishAssociation = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  filling_score: number | null;
  image_path?: string | null;
  created_at: string | null;
  review_text?: string | null;
};

export default function DishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const dishName = typeof params.dishName === 'string' ? params.dishName : '';
  const dishQuery = typeof params.dishQuery === 'string' ? params.dishQuery : '';
  const refreshParam = typeof params.refresh === 'string' ? params.refresh : '';
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
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [avgScores, setAvgScores] = useState<{
    tasty: number;
    filling: number;
  } | null>(null);

  const sortedAssociations = useMemo(() => {
    return [...dishAssociations].sort((a, b) => {
      const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bDate - aDate;
    });
  }, [dishAssociations]);

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
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  };

  const deleteDishAssociation = async (dish: DishAssociation) => {
    Alert.alert('מחיקת מנה', 'האם למחוק את המנה והביקורות שלה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!currentUserId) {
              Alert.alert('אין הרשאה', 'יש להתחבר מחדש כדי למחוק.');
              return;
            }
            if (dish.user_id !== currentUserId) {
              Alert.alert('אין הרשאה', 'אפשר למחוק רק מנות שהעלית.');
              return;
            }
            if (dish.image_path) {
              await supabase.storage.from('dish-images').remove([dish.image_path]);
            }
            await supabase.from('dish_favorites').delete().eq('dish_association_id', dish.id);
            const { error } = await supabase
              .from('dish_associations')
              .delete()
              .eq('id', dish.id)
              .eq('user_id', currentUserId);
            if (error) throw error;

            setDishAssociations((prev) => prev.filter((item) => item.id !== dish.id));
            setFavorites((prev) => {
              const next = { ...prev };
              delete next[dish.id];
              return next;
            });
            loadDishAssociations();
          } catch (err) {
            Alert.alert('שגיאה', 'מחיקה נכשלה.');
          }
        },
      },
    ]);
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
      setHasLoaded(false);
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
            'id, user_id, dish_id, image_url, image_path, dish_name, restaurant_name, restaurant_id, tasty_score, filling_score, created_at, review_text'
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
        let fillingSum = 0;
        let fillingCount = 0;
        list.forEach((row) => {
          if (typeof row.tasty_score === 'number') {
            tastySum += row.tasty_score;
            tastyCount += 1;
          }
          if (typeof row.filling_score === 'number') {
            fillingSum += row.filling_score;
            fillingCount += 1;
          }
        });
        setAvgScores({
          tasty: tastyCount ? tastySum / tastyCount : 0,
          filling: fillingCount ? fillingSum / fillingCount : 0,
        });
      } else {
        setAvgScores(null);
      }
    } catch (err) {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
      setHasLoaded(true);
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
  }, [dishName, dishQuery, dishIdParam, restaurantIdParam, restaurantName, refreshParam]);

  const headerRestaurant =
    restaurantName ||
    (dishAssociations.length > 0
      ? dishAssociations[0].restaurant_name ?? null
      : restaurantIdParam
        ? `מסעדה ${restaurantIdParam}`
        : null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
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
                <Text style={styles.ratingValueInline}>{Math.round(avgScores.tasty)}%</Text>
                <Ionicons name="fast-food-outline" size={18} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.ratingLabelInline}>טעים</Text>
            </View>
            <View style={styles.ratingItem}>
              <View style={styles.ratingTopRow}>
                <Text style={styles.ratingValueInline}>{Math.round(avgScores.filling)}%</Text>
                <Ionicons name="restaurant-outline" size={18} color={theme.colors.textMuted} />
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
      {sortedAssociations.length > 0 ? (
        <FlatList
          data={sortedAssociations}
          keyExtractor={(item) => item.id}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={styles.feedContent}
          renderItem={({ item }) => (
            <DishCard
              items={[item]}
              favorites={favorites}
              currentUserId={currentUserId}
              avatarUrl={avatarUrl}
              userAvatars={userAvatars}
              userLabels={{}}
              showReview
              onToggleFavorite={(id) => toggleFavorite(id)}
              onOpenPhoto={(dish) => setFullScreenImage(dish.image_url ?? null)}
              onOpenRestaurant={(dish) =>
                router.push({
                  pathname: '/restaurant',
                  params: {
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                  },
                })
              }
              onOpenCamera={(dish) =>
                router.push({
                  pathname: '/camera',
                  params: {
                    restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
                    restaurantName: dish.restaurant_name ?? '',
                    dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
                    dishName: dish.dish_name ?? '',
                  },
                })
              }
              onDelete={(dish) => deleteDishAssociation(dish)}
              onEdit={(dish) =>
                router.push({
                  pathname: '/edit-dish',
                  params: { id: dish.id, returnTo: 'dish' },
                })
              }
            />
          )}
        />
      ) : !loading && !error && hasLoaded ? (
        <View style={styles.results}>
          <Text style={styles.placeholderText}>אין מנות להצגה</Text>
        </View>
      ) : null}
      <Modal
        visible={Boolean(fullScreenImage)}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenImage(null)}
      >
        <Pressable style={styles.fullscreenOverlay} onPress={() => setFullScreenImage(null)}>
          <Pressable style={styles.fullscreenContent} onPress={() => {}}>
            {fullScreenImage ? (
              <Image source={{ uri: fullScreenImage }} style={styles.fullscreenImage} />
            ) : null}
            <Pressable style={styles.fullscreenClose} onPress={() => setFullScreenImage(null)}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    borderColor: theme.colors.border,
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
    color: theme.colors.text,
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  results: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.colors.cardAlt,
  },
  avgCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.card,
    marginBottom: 10,
  },
  avgHeader: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
  },
  feedContent: {
    paddingBottom: 120,
    gap: 16,
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
    color: theme.colors.text,
  },
  ratingLabelInline: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  fullscreenContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 18,
    backgroundColor: theme.colors.ink,
  },
  fullscreenClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    height: 36,
    width: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
  },
});
