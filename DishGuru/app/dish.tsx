import {
  AppState,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadCachedAvatar } from '../lib/avatar';
import DishCard from '../components/DishCard';
import AvatarPreviewModal from '../components/AvatarPreviewModal';
import RatingValueRow from '../components/RatingValueRow';
import { DishScreenSkeleton } from '../components/LoadingSkeleton';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import { openVendorDish } from '../lib/orderVendor';
import { showAppAlert, showAppDialog } from '../lib/appDialog';
import { fetchCompanyIdForUser, fetchFavoritesMap, fetchOrderVendorForUser, fetchUserAvatarMaps, fetchVisibleDishes } from '../lib/appData';

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
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orderVendor, setOrderVendor] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const loadDishAssociationsRef = useRef<((options?: { showLoading?: boolean }) => Promise<void>) | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);
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


  const loadFavorites = useCallback(async (userId: string) => {
    try {
      setFavorites(await fetchFavoritesMap(userId));
    } catch {}
  }, []);

  const loadOrderVendor = useCallback(async (userId: string) => {
    setOrderVendor(await fetchOrderVendorForUser(userId));
  }, []);

  const toggleFavorite = useCallback(async (dishAssociationId: string) => {
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
    } catch {
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  }, [favorites]);

  const deleteDishAssociation = useCallback(async (dish: DishAssociation) => {
    showAppDialog({
      title: 'מחיקת מנה',
      message: 'האם למחוק את המנה והביקורות שלה?',
      actions: [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!currentUserId) {
                showAppAlert('אין הרשאה', 'יש להתחבר מחדש כדי למחוק.');
                return;
              }
              if (dish.user_id !== currentUserId) {
                showAppAlert('אין הרשאה', 'אפשר למחוק רק מנות שהעלית.');
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
              await loadDishAssociationsRef.current?.({ showLoading: false });
            } catch {
              showAppAlert('שגיאה', 'מחיקה נכשלה.');
            }
          },
        },
      ],
    });
  }, [currentUserId]);

  const loadUserAvatars = async (items: DishAssociation[]) => {
    const ids = Array.from(
      new Set(items.map((item) => item.user_id).filter(Boolean) as string[])
    );
    if (ids.length === 0) {
      setUserAvatars({});
      setUserLabels({});
      return;
    }
    const { avatars, labels } = await fetchUserAvatarMaps(ids);
    setUserAvatars(avatars);
    setUserLabels(labels);
  };

  const loadDishAssociations = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!dishName && !dishQuery && dishIdParam === null) {
      setError('חסר שם מנה');
      setDishAssociations([]);
      setAvgScores(null);
      return;
    }
    try {
      const shouldShowLoading = options?.showLoading ?? true;
      if (shouldShowLoading) {
        setHasLoaded(false);
        setLoading(true);
      }
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      let list: DishAssociation[] = [];

      let hasScopedSource = false;
      if (userId) {
        const companyId = await fetchCompanyIdForUser(userId);
        if (companyId) {
          hasScopedSource = true;
          const allRows = (await fetchVisibleDishes(companyId)) as DishAssociation[];
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

      if (list.length === 0 && !hasScopedSource) {
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
    } catch {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      if (options?.showLoading ?? true) {
        setLoading(false);
      }
      setHasLoaded(true);
    }
  }, [dishIdParam, dishName, dishQuery, restaurantIdParam, restaurantName]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setCurrentUserId(data.session?.user?.id ?? null);
      const cachedAvatar = await loadCachedAvatar(data.session?.user?.id ?? null);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      if (data.session?.user?.id) {
        await loadFavorites(data.session.user.id);
        await loadOrderVendor(data.session.user.id);
      }
      await loadDishAssociations({ showLoading: dishAssociations.length === 0 });
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
      if (session?.user?.id) {
        loadFavorites(session.user.id);
        loadOrderVendor(session.user.id);
      } else {
        setFavorites({});
        setOrderVendor(null);
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [dishAssociations.length, loadDishAssociations, loadFavorites, loadOrderVendor, refreshParam]);

  useEffect(() => {
    loadDishAssociationsRef.current = loadDishAssociations;
  }, [loadDishAssociations]);

  const refreshContent = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadDishAssociations();
      if (currentUserId) {
        await loadFavorites(currentUserId);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUserId, loadDishAssociations, loadFavorites]);

  useFocusEffect(
    useCallback(() => {
      refreshContent();
    }, [refreshContent])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = /inactive|background/.test(appStateRef.current);
      if (wasInactive && nextState === 'active') {
        refreshContent();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [refreshContent]);

  const handleOpenRestaurant = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/restaurant',
        params: {
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
        },
      });
    },
    [router]
  );

  const handleOpenCamera = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/camera',
        params: {
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
          dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
          dishName: dish.dish_name ?? '',
          lockSelection: '1',
        },
      });
    },
    [router]
  );

  const handleEdit = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/edit-dish',
        params: { id: dish.id, returnTo: 'dish' },
      });
    },
    [router]
  );

  const handleOpenPhoto = useCallback((dish: DishAssociation) => {
    setFullScreenImage(dish.image_url ?? null);
  }, []);

  const handleAvatarPress = useCallback((url: string | null, label: string | null) => {
    setAvatarPreviewUrl(url);
    setAvatarPreviewLabel(label);
    setAvatarPreviewOpen(true);
  }, []);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      toggleFavorite(id);
    },
    [toggleFavorite]
  );

  const handleOrder = useCallback(
    (dish: DishAssociation) => {
      openVendorDish(orderVendor, dish.restaurant_id, dish.dish_id);
    },
    [orderVendor]
  );

  const renderDishItem = useCallback(
    ({ item }: { item: DishAssociation }) => (
      <DishCard
        items={[item]}
        favorites={favorites}
        currentUserId={currentUserId}
        avatarUrl={avatarUrl}
        userAvatars={userAvatars}
        userLabels={userLabels}
        showReview
        onToggleFavorite={handleToggleFavorite}
        onOpenPhoto={handleOpenPhoto}
        onAvatarPress={handleAvatarPress}
        onOpenRestaurant={handleOpenRestaurant}
        onOpenCamera={handleOpenCamera}
        onDelete={deleteDishAssociation}
        onEdit={handleEdit}
        onOrder={handleOrder}
      />
    ),
    [
      avatarUrl,
      currentUserId,
      deleteDishAssociation,
      favorites,
      handleEdit,
      handleOpenCamera,
      handleAvatarPress,
      handleOpenPhoto,
      handleOpenRestaurant,
      handleOrder,
      handleToggleFavorite,
      userAvatars,
      userLabels,
    ]
  );

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
              <RatingValueRow
                label="טעים"
                score={avgScores.tasty}
                iconSize={30}
                rowStyle={styles.ratingInlineRow}
                labelStyle={styles.ratingLabelInline}
              />
            </View>
            <View style={styles.ratingItem}>
              <RatingValueRow
                label="משביע"
                score={avgScores.filling}
                iconSize={30}
                rowStyle={styles.ratingInlineRow}
                labelStyle={styles.ratingLabelInline}
              />
            </View>
          </View>
        </View>
      ) : null}
      {loading && !isRefreshing ? (
        <View style={styles.results}>
          <DishScreenSkeleton />
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
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refreshContent}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
          renderItem={renderDishItem}
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
      <AvatarPreviewModal
        visible={avatarPreviewOpen}
        avatarUrl={avatarPreviewUrl}
        label={avatarPreviewLabel}
        onClose={() => {
          setAvatarPreviewOpen(false);
          setAvatarPreviewUrl(null);
          setAvatarPreviewLabel(null);
        }}
      />
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
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    width: '98%',
    marginRight: 6,
  },
  avgHeader: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
    alignSelf: 'flex-end',
  },
  feedContent: {
    paddingBottom: 120,
    gap: 16,
  },
  ratingRow: {
    flexDirection: 'column',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginRight: 14,
  },
  ratingItem: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-end',
    width: 210,
    justifyContent: 'flex-end',
    paddingRight: 20,
  },
  ratingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    minWidth: 44,
    textAlign: 'right',
    alignSelf: 'flex-end',
    width: 52,
    lineHeight: 30,
    paddingRight: 8,
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
