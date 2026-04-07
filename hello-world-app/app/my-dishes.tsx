import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
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
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadCachedAvatar } from '../lib/avatar';
import DishCard from '../components/DishCard';
import CachedLogo from '../components/CachedLogo';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import { openVendorDish } from '../lib/orderVendor';

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

const AVATAR_MODAL_SIZE = 220;

export default function MyDishesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dishAssociations, setDishAssociations] = useState<DishAssociation[]>([]);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orderVendor, setOrderVendor] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);

  const groupedMyDishes = useMemo(() => {
    const map = new Map<string, DishAssociation[]>();
    dishAssociations.forEach((item) => {
      const normalizedDish = (item.dish_name ?? '').trim().toLowerCase();
      const normalizedRest = (item.restaurant_name ?? '').trim().toLowerCase();
      const dishKey = normalizedDish ? `dishName:${normalizedDish}` : `dish:${item.dish_id ?? 'none'}`;
      const restKey = normalizedRest ? `restName:${normalizedRest}` : `rest:${item.restaurant_id ?? 'none'}`;
      const key = `${dishKey}::${restKey}`;
      const list = map.get(key) ?? [];
      list.push(item);
      list.sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      });
      map.set(key, list);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aDate = a[0]?.created_at ? new Date(a[0].created_at).getTime() : 0;
      const bDate = b[0]?.created_at ? new Date(b[0].created_at).getTime() : 0;
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
    } catch (err) {
      setFavorites((prev) => ({ ...prev, [dishAssociationId]: isFav }));
    }
  }, [favorites]);

  const deleteDishAssociation = useCallback(async (dish: DishAssociation) => {
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
            loadMyDishes(currentUserId);
          } catch (err) {
            Alert.alert('שגיאה', 'מחיקה נכשלה.');
          }
        },
      },
    ]);
  }, [currentUserId]);

  const loadMyDishes = async (userId: string) => {
    try {
      setHasLoaded(false);
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('dish_associations')
        .select(
          'id, user_id, dish_id, image_url, image_path, dish_name, restaurant_name, restaurant_id, tasty_score, filling_score, created_at'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setDishAssociations((data as DishAssociation[]) ?? []);
    } catch (err) {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  };

  const loadOrderVendor = useCallback(async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from('AppUsers')
      .select('company_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileError || !profile?.company_id) {
      setOrderVendor(null);
      return;
    }
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('order_vendor')
      .eq('id', profile.company_id)
      .maybeSingle();
    if (companyError) {
      setOrderVendor(null);
      return;
    }
    setOrderVendor(company?.order_vendor ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const userId = data.session?.user?.id ?? null;
      setCurrentUserId(userId);
      const cachedAvatar = await loadCachedAvatar(userId);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
      if (userId) {
        await loadFavorites(userId);
        await loadOrderVendor(userId);
        await loadMyDishes(userId);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      setCurrentUserId(userId);
      if (userId) {
        loadFavorites(userId);
        loadOrderVendor(userId);
        loadMyDishes(userId);
      } else {
        setFavorites({});
        setDishAssociations([]);
        setOrderVendor(null);
      }
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refreshContent = useCallback(async () => {
    if (!currentUserId) return;
    setIsRefreshing(true);
    try {
      await Promise.all([loadFavorites(currentUserId), loadMyDishes(currentUserId)]);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUserId]);

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

  const handleOpenDish = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/dish',
        params: {
          dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
          dishName: dish.dish_name ?? '',
          restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
          restaurantName: dish.restaurant_name ?? '',
        },
      });
    },
    [router]
  );

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
        },
      });
    },
    [router]
  );

  const handleEdit = useCallback(
    (dish: DishAssociation) => {
      router.push({
        pathname: '/edit-dish',
        params: { id: dish.id, returnTo: 'my' },
      });
    },
    [router]
  );

  const handleOrder = useCallback(
    (dish: DishAssociation) => {
      openVendorDish(orderVendor, dish.restaurant_id, dish.dish_id);
    },
    [orderVendor]
  );

  const renderMyDish = useCallback(
    ({ item }: { item: DishAssociation[] }) => (
      <DishCard
        items={item}
        favorites={favorites}
        currentUserId={currentUserId}
        avatarUrl={avatarUrl}
        userAvatars={{}}
        userLabels={{}}
        onAvatarPress={handleAvatarPress}
        onToggleFavorite={handleToggleFavorite}
        onOpenPhoto={handleOpenDish}
        onOpenDish={handleOpenDish}
        onOpenRestaurant={handleOpenRestaurant}
        onDelete={deleteDishAssociation}
        onOpenCamera={handleOpenCamera}
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
      handleOpenDish,
      handleOpenRestaurant,
      handleOrder,
      handleToggleFavorite,
      handleAvatarPress,
    ]
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        data={groupedMyDishes}
        keyExtractor={(item) => item[0]?.id ?? Math.random().toString()}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={styles.feedContent}
        ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshContent}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.headerRow}>
              <Pressable
                style={styles.backButton}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
              </Pressable>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>המנות שלי</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading && !error && hasLoaded ? (
            <View style={styles.results}>
              <Text style={styles.placeholderText}>אין מנות להצגה</Text>
            </View>
          ) : null
        }
        renderItem={renderMyDish}
        ListFooterComponent={
          loading && !isRefreshing ? (
            <View style={styles.centered}>
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
      <Modal
        visible={avatarPreviewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setAvatarPreviewOpen(false);
          setAvatarPreviewUrl(null);
          setAvatarPreviewLabel(null);
        }}
      >
        <View style={styles.avatarModalBackdrop}>
          <Pressable
            style={styles.avatarModalOverlay}
            onPress={() => {
              setAvatarPreviewOpen(false);
              setAvatarPreviewUrl(null);
              setAvatarPreviewLabel(null);
            }}
          />
          <View style={styles.avatarModalWrapper}>
            <View style={styles.avatarModalCard}>
              {avatarPreviewUrl ? (
                <CachedLogo uri={avatarPreviewUrl} style={styles.avatarModalImage} />
              ) : (
                <View style={styles.avatarModalPlaceholder}>
                  <Ionicons name="person" size={64} color={theme.colors.textMuted} />
                </View>
              )}
              {avatarPreviewLabel ? (
                <View style={styles.avatarEmailPill}>
                  <Text style={styles.avatarEmailText}>{avatarPreviewLabel}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              style={styles.avatarModalClose}
              onPress={() => {
                setAvatarPreviewOpen(false);
                setAvatarPreviewUrl(null);
                setAvatarPreviewLabel(null);
              }}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </Pressable>
          </View>
        </View>
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
    marginBottom: 0,
  },
  listHeader: {
    paddingTop: 15,
    paddingBottom: 15,
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
  results: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.colors.cardAlt,
  },
  placeholderText: {
    textAlign: 'right',
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  feedContent: {
    paddingBottom: 120,
  },
  cardSeparator: {
    height: 16,
  },
  centered: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  avatarModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  avatarModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  avatarModalWrapper: {
    width: AVATAR_MODAL_SIZE,
    height: AVATAR_MODAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarModalCard: {
    width: AVATAR_MODAL_SIZE,
    height: AVATAR_MODAL_SIZE,
    borderRadius: AVATAR_MODAL_SIZE / 2,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  avatarModalImage: {
    width: '100%',
    height: '100%',
  },
  avatarModalPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  avatarModalClose: {
    position: 'absolute',
    top: 8,
    right: -36,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarEmailPill: {
    position: 'absolute',
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarEmailText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
