import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  I18nManager,
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
import { SvgXml } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { loadCachedAvatar } from '../lib/avatar';
import DishCard from '../components/DishCard';
import CachedLogo from '../components/CachedLogo';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import { openVendorDish } from '../lib/orderVendor';
import { RATING_SVGS, getSelectedEmojiIndex, scoreToStars } from '../lib/ratings';

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
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);
  const [avgScores, setAvgScores] = useState<{
    tasty: number;
    filling: number;
  } | null>(null);

  const renderStars = (score: number) => {
    const indices = [4, 3, 2, 1, 0];
    const selectedIndex = getSelectedEmojiIndex(score);
    return (
      <View style={[styles.starRow, I18nManager.isRTL && styles.starRowRtl]}>
        {indices.map((idx) => {
          const opacity = selectedIndex === idx ? 1 : 0.6;
          return (
            <SvgXml
              key={`face-${idx}`}
              xml={RATING_SVGS[idx]}
              width={30}
              height={30}
              style={[styles.emojiIcon, { opacity }]}
            />
          );
        })}
      </View>
    );
  };

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
            loadDishAssociations();
          } catch (err) {
            Alert.alert('שגיאה', 'מחיקה נכשלה.');
          }
        },
      },
    ]);
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
    const { data: profileData, error: profileError } = await supabase.rpc('get_user_profiles', {
      user_ids: ids,
    });
    if (!profileError && Array.isArray(profileData)) {
      const map: Record<string, string> = {};
      const labels: Record<string, string> = {};
      (profileData ?? []).forEach((row: any) => {
        if (row?.user_id && row?.avatar_url) {
          map[String(row.user_id)] = String(row.avatar_url);
        }
        if (row?.user_id && row?.email_prefix) {
          labels[String(row.user_id)] = String(row.email_prefix);
        }
      });
      setUserAvatars(map);
      setUserLabels(labels);
      return;
    }
    const { data, error: avatarError } = await supabase
      .from('AppUsers')
      .select('user_id, avatar_url')
      .in('user_id', ids);
    if (avatarError) {
      setUserAvatars({});
      setUserLabels({});
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((row: any) => {
      if (row?.user_id && row?.avatar_url) {
        map[String(row.user_id)] = String(row.avatar_url);
      }
    });
    setUserAvatars(map);
    setUserLabels({});
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
        await loadOrderVendor(data.session.user.id);
      }
      await loadDishAssociations();
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
  }, [dishName, dishQuery, dishIdParam, restaurantIdParam, restaurantName, refreshParam]);

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
  }, [currentUserId, dishName, dishQuery, dishIdParam, restaurantIdParam, restaurantName]);

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
              <View style={styles.ratingInlineRow}>
                <Text style={styles.ratingLabelInline}>טעים</Text>
                {renderStars(scoreToStars(avgScores.tasty))}
              </View>
            </View>
            <View style={styles.ratingItem}>
              <View style={styles.ratingInlineRow}>
                <Text style={styles.ratingLabelInline}>משביע</Text>
                {renderStars(scoreToStars(avgScores.filling))}
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {loading && !isRefreshing ? (
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
    width: '100%',
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
    paddingRight: 30,
  },
  starRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 1,
    width: 170,
    justifyContent: 'flex-end',
  },
  starRowRtl: {
    flexDirection: 'row-reverse',
  },
  emojiIcon: {
    marginLeft: 2,
  },
  ratingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    minWidth: 44,
    textAlign: 'right',
    alignSelf: 'flex-end',
    width: 52,
    lineHeight: 30,
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
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
  },
});
