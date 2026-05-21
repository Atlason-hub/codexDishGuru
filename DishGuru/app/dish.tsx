import {
  AppState,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import ImagePreviewModal from '../components/ImagePreviewModal';
import CrossfadeView from '../components/CrossfadeView';
import RatingValueRow from '../components/RatingValueRow';
import { DishScreenSkeleton } from '../components/LoadingSkeleton';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import { openVendorDish } from '../lib/orderVendor';
import { showAppAlert, showAppDialog } from '../lib/appDialog';
import { fetchCompanyIdForUser, fetchFavoritesMap, fetchOrderVendorForUser, fetchUserAvatarMaps, fetchVisibleDishes } from '../lib/appData';
import { useLocale } from '../lib/locale';

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
  const { isRTL, t } = useLocale();
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
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string | null;
    title: string | null;
    subtitle: string | null;
  } | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const loadDishAssociationsRef = useRef<((options?: { showLoading?: boolean }) => Promise<void>) | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewLabel, setAvatarPreviewLabel] = useState<string | null>(null);
  const [reportModalDish, setReportModalDish] = useState<DishAssociation | null>(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessPending, setReportSuccessPending] = useState(false);
  const [reportKeyboardHeight, setReportKeyboardHeight] = useState(0);
  const reportScrollRef = useRef<ScrollView | null>(null);
  const [avgScores, setAvgScores] = useState<{
    tasty: number;
    filling: number;
  } | null>(null);

  const reportReasons = useMemo(
    () => [
      { value: 'wrong_photo', label: t('dishReportReasonWrongPhoto') },
      { value: 'wrong_name', label: t('dishReportReasonWrongName') },
      { value: 'offensive', label: t('dishReportReasonOffensive') },
      { value: 'spam_duplicate', label: t('dishReportReasonSpam') },
      { value: 'wrong_restaurant', label: t('dishReportReasonWrongRestaurant') },
      { value: 'other', label: t('dishReportReasonOther') },
    ],
    [t]
  );

  const sortedAssociations = useMemo(() => {
    const uniqueById = new Map<string, DishAssociation>();
    dishAssociations.forEach((row) => {
      const key = String(row.id ?? '');
      const existing = uniqueById.get(key);
      if (!existing) {
        uniqueById.set(key, row);
        return;
      }
      const existingTime = existing.created_at ? new Date(existing.created_at).getTime() : 0;
      const nextTime = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (nextTime >= existingTime) {
        uniqueById.set(key, row);
      }
    });

    return [...uniqueById.values()].sort((a, b) => {
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
      title: t('dishDeleteTitle'),
      message: t('dishDeleteMessage'),
      actions: [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('commonDelete'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (!currentUserId) {
                showAppAlert(t('accountUnauthorized'), t('accountReloginToDelete'));
                return;
              }
              if (dish.user_id !== currentUserId) {
                showAppAlert(t('accountUnauthorized'), t('dishDeleteUnauthorized'));
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
              showAppAlert(t('accountDeleteFailed'), t('accountDeleteFailed'));
            }
          },
        },
      ],
    });
  }, [currentUserId, t]);

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
            const matchesDish =
              dishIdParam !== null
                ? row.dish_id === dishIdParam
                : normalizedQuery
                  ? (row.dish_name ?? '').toLowerCase().includes(normalizedQuery)
                  : (row.dish_name ?? '').toLowerCase() === dishName.toLowerCase();

            if (!matchesDish) {
              return false;
            }

            if (restaurantIdParam) {
              return row.restaurant_id === restaurantIdParam;
            }
            if (restaurantName) {
              return (row.restaurant_name ?? '').toLowerCase() === restaurantName.toLowerCase();
            }
            return true;
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

  useEffect(() => {
    if (!reportModalDish) {
      setReportKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setReportKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setReportKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [reportModalDish]);

  useEffect(() => {
    if (!reportSuccessPending || reportModalDish) return;
    const timer = setTimeout(() => {
      setReportSuccessPending(false);
      showAppAlert(t('dishReportSuccessTitle'), t('dishReportSuccessMessage'));
    }, 120);
    return () => clearTimeout(timer);
  }, [reportModalDish, reportSuccessPending, t]);

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
    setImagePreview({
      imageUrl: dish.image_url ?? null,
      title: dish.dish_name ?? null,
      subtitle: dish.restaurant_name ?? null,
    });
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

  const handleOpenReport = useCallback(
    (dish: DishAssociation) => {
      if (!currentUserId) {
        showAppAlert(t('authGuestActionTitle'), t('authGuestActionMessage'));
        return;
      }
      setReportModalDish(dish);
      setReportReason(null);
      setReportDetails('');
    },
    [currentUserId, t]
  );

  const handleCloseReportModal = useCallback(() => {
    if (isSubmittingReport) return;
    setReportModalDish(null);
    setReportReason(null);
    setReportDetails('');
  }, [isSubmittingReport]);

  const handleSubmitReport = useCallback(async () => {
    if (!reportModalDish || !currentUserId) {
      showAppAlert(t('authGuestActionTitle'), t('authGuestActionMessage'));
      return;
    }
    if (!reportReason) {
      showAppAlert(t('dishReportTitle'), t('dishReportReasonRequired'));
      return;
    }

    try {
      setIsSubmittingReport(true);
      const { error: insertError } = await supabase.from('dish_reports').insert({
        dish_association_id: reportModalDish.id,
        reported_by_user_id: currentUserId,
        reason: reportReason,
        details: reportDetails.trim() ? reportDetails.trim() : null,
      });
      if (insertError) throw insertError;

      setReportModalDish(null);
      setReportReason(null);
      setReportDetails('');
      setReportSuccessPending(true);
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error ? String(error.message ?? '') : '';
      if (
        message.toLowerCase().includes('duplicate') ||
        message.includes('dish_reports_unique_reporter_per_dish')
      ) {
        showAppAlert(t('dishReportDuplicateTitle'), t('dishReportDuplicateMessage'));
      } else {
        showAppAlert(t('dishReportFailedTitle'), t('dishReportFailedMessage'));
      }
    } finally {
      setIsSubmittingReport(false);
    }
  }, [currentUserId, reportDetails, reportModalDish, reportReason, t]);

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
        reviewStackCount={sortedAssociations.length}
        favorites={favorites}
        currentUserId={currentUserId}
        avatarUrl={avatarUrl}
        userAvatars={userAvatars}
        userLabels={userLabels}
        showReview
        onToggleFavorite={handleToggleFavorite}
        onOpenPhoto={handleOpenPhoto}
        onPreviewImage={handleOpenPhoto}
        onAvatarPress={handleAvatarPress}
        onOpenRestaurant={handleOpenRestaurant}
        onOpenCamera={handleOpenCamera}
        onDelete={deleteDishAssociation}
        onEdit={handleEdit}
        onOrder={handleOrder}
        onReport={handleOpenReport}
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
      handleOpenReport,
      handleOpenRestaurant,
      handleOrder,
      handleToggleFavorite,
      sortedAssociations.length,
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
  const headerRestaurantTarget =
    dishAssociations.find((item) => item.restaurant_id || item.restaurant_name) ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.headerRow, !isRTL && styles.headerRowLtr]}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.ink} />
        </Pressable>
        <View style={[styles.headerTextWrap, !isRTL && styles.headerTextWrapLtr]}>
          <Text style={[styles.headerTitle, !isRTL && styles.headerTitleLtr]}>
            {dishQuery || dishName || 'מנה'}
          </Text>
          {headerRestaurantTarget ? (
            <Pressable
              hitSlop={10}
              onPress={() => handleOpenRestaurant(headerRestaurantTarget)}
              style={({ pressed }) => [
                styles.headerSubtitlePressable,
                pressed && styles.headerSubtitlePressablePressed,
              ]}
            >
              <Text style={[styles.headerSubtitle, !isRTL && styles.headerSubtitleLtr]}>
                {headerRestaurant ?? ''}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.headerSubtitle, !isRTL && styles.headerSubtitleLtr]}>
              {headerRestaurant ?? ''}
            </Text>
          )}
        </View>
      </View>
      {avgScores ? (
        <View style={[styles.avgCard, !isRTL && styles.avgCardLtr]}>
          <Text style={[styles.avgHeader, !isRTL && styles.avgHeaderLtr]}>{t('dishAverageScore')}</Text>
          <View style={[styles.ratingRow, !isRTL && styles.ratingRowLtr]}>
            <View style={[styles.ratingItem, !isRTL && styles.ratingItemLtr]}>
              <RatingValueRow
                label={t('ratingTasty')}
                score={avgScores.tasty}
                iconSize={isRTL ? 30 : 28}
                rowStyle={[styles.avgRatingInlineRow, !isRTL && styles.avgRatingInlineRowLtr]}
                labelStyle={[styles.avgRatingLabelInline, !isRTL && styles.avgRatingLabelInlineLtr]}
                iconsWrapStyle={styles.avgRatingIconsWrap}
              />
            </View>
            <View style={[styles.ratingItem, !isRTL && styles.ratingItemLtr]}>
              <RatingValueRow
                label={t('ratingSize')}
                score={avgScores.filling}
                iconSize={isRTL ? 30 : 28}
                rowStyle={[styles.avgRatingInlineRow, !isRTL && styles.avgRatingInlineRowLtr]}
                labelStyle={[styles.avgRatingLabelInline, !isRTL && styles.avgRatingLabelInlineLtr]}
                iconsWrapStyle={styles.avgRatingIconsWrap}
              />
            </View>
          </View>
        </View>
      ) : null}
      {loading && !isRefreshing ? (
        <CrossfadeView style={styles.results}>
          <DishScreenSkeleton />
        </CrossfadeView>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {sortedAssociations.length > 0 ? (
        <CrossfadeView style={styles.feedListWrap}>
          <FlatList
            data={sortedAssociations}
            keyExtractor={(item, index) =>
              `${item.id ?? 'association'}:${item.created_at ?? 'no-date'}:${index}`
            }
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
        </CrossfadeView>
      ) : !loading && !error && hasLoaded ? (
        <View style={styles.results}>
          <Text style={styles.placeholderText}>אין מנות להצגה</Text>
        </View>
      ) : null}
      {reportModalDish ? (
        <View style={styles.reportOverlay} pointerEvents="box-none">
          <Pressable style={styles.reportOverlayBackdrop} onPress={handleCloseReportModal} />
          <View
            style={[
              styles.reportOverlayContent,
              Platform.OS === 'ios' ? styles.reportOverlayContentIos : null,
              reportKeyboardHeight > 0
                ? Platform.OS === 'ios'
                  ? { paddingBottom: Math.max(reportKeyboardHeight - 12, 0), paddingTop: 16 }
                  : { paddingBottom: Math.max(reportKeyboardHeight - 24, 0) }
                : null,
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.reportModalCard}>
              <ScrollView
                ref={reportScrollRef}
                style={styles.reportModalScroll}
                contentContainerStyle={styles.reportModalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={[styles.reportModalHeader, !isRTL && styles.reportModalHeaderLtr]}>
                  <Text style={[styles.reportModalTitle, !isRTL && styles.reportModalTitleLtr]}>
                    {t('dishReportTitle')}
                  </Text>
                  <Pressable
                    style={styles.reportModalClose}
                    onPress={handleCloseReportModal}
                    disabled={isSubmittingReport}
                  >
                    <Ionicons name="close" size={20} color={theme.colors.ink} />
                  </Pressable>
                </View>
                <Text style={[styles.reportModalSubtitle, !isRTL && styles.reportModalSubtitleLtr]}>
                  {t('dishReportSubtitle')}
                </Text>
                <View style={styles.reportReasonList}>
                  {reportReasons.map((reasonItem) => {
                    const selected = reportReason === reasonItem.value;
                    return (
                      <Pressable
                        key={reasonItem.value}
                        style={[
                          styles.reportReasonButton,
                          selected && styles.reportReasonButtonSelected,
                        ]}
                        onPress={() => setReportReason(reasonItem.value)}
                        disabled={isSubmittingReport}
                      >
                        <Text
                          style={[
                            styles.reportReasonText,
                            selected && styles.reportReasonTextSelected,
                            !isRTL && styles.reportReasonTextLtr,
                          ]}
                        >
                          {reasonItem.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={[styles.reportTextInput, !isRTL && styles.reportTextInputLtr]}
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  onFocus={() => {
                    setTimeout(() => {
                      reportScrollRef.current?.scrollToEnd({ animated: true });
                    }, Platform.OS === 'ios' ? 180 : 120);
                  }}
                  placeholder={t('dishReportDetailsPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  maxLength={280}
                  editable={!isSubmittingReport}
                  textAlign={isRTL ? 'right' : 'left'}
                />
                <Pressable
                  style={[
                    styles.reportSubmitButton,
                    isSubmittingReport && styles.reportSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitReport}
                  disabled={isSubmittingReport}
                >
                  <Text style={styles.reportSubmitButtonText}>
                    {isSubmittingReport ? `${t('dishReportSubmit')}...` : t('dishReportSubmit')}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </View>
      ) : null}
      <ImagePreviewModal
        visible={Boolean(imagePreview?.imageUrl)}
        imageUrl={imagePreview?.imageUrl ?? null}
        title={imagePreview?.title ?? null}
        subtitle={imagePreview?.subtitle ?? null}
        onClose={() => setImagePreview(null)}
      />
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
  headerRowLtr: {
    flexDirection: 'row-reverse',
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
  headerTextWrapLtr: {
    alignItems: 'flex-start',
    marginRight: 0,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
    textAlign: 'right',
  },
  headerTitleLtr: {
    textAlign: 'left',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    fontFamily: theme.typography.semibold,
  },
  headerSubtitleLtr: {
    textAlign: 'left',
  },
  headerSubtitlePressable: {
    marginTop: 2,
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  headerSubtitlePressablePressed: {
    opacity: 0.72,
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
  avgCardLtr: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginRight: 0,
    marginLeft: 6,
  },
  avgHeader: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
    alignSelf: 'flex-end',
    fontFamily: theme.typography.bold,
  },
  avgHeaderLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  feedContent: {
    flexGrow: 1,
    paddingBottom: 120,
    gap: 16,
  },
  feedListWrap: {
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'column',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginRight: Platform.OS === 'ios' ? 4 : 14,
  },
  ratingRowLtr: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginRight: 0,
    marginLeft: 6,
  },
  ratingItem: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    width: Platform.OS === 'ios' ? 236 : undefined,
  },
  ratingItemLtr: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 16 : 4,
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: Platform.OS === 'ios' ? 0 : 20,
  },
  ratingInlineRowLtr: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 0,
    paddingLeft: 8,
  },
  avgRatingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 8 : 4,
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: Platform.OS === 'ios' ? 0 : 8,
    width: Platform.OS === 'ios' ? 236 : undefined,
  },
  avgRatingInlineRowLtr: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 0,
    paddingLeft: 8,
  },
  avgRatingIconsWrap: {
    width: Platform.OS === 'ios' ? 152 : 150,
    alignItems: 'flex-end',
  },
  ratingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    minWidth: Platform.OS === 'ios' ? 30 : 44,
    textAlign: 'right',
    alignSelf: 'flex-end',
    width: Platform.OS === 'ios' ? 34 : 52,
    lineHeight: 30,
    paddingRight: Platform.OS === 'ios' ? 0 : 8,
    fontFamily: theme.typography.semibold,
  },
  ratingLabelInlineLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
    paddingRight: 0,
    paddingLeft: 4,
  },
  avgRatingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'flex-end',
    lineHeight: 30,
    paddingRight: Platform.OS === 'ios' ? 0 : 2,
    minWidth: Platform.OS === 'ios' ? 68 : 48,
    width: Platform.OS === 'ios' ? 68 : 56,
    fontFamily: theme.typography.semibold,
  },
  avgRatingLabelInlineLtr: {
    textAlign: 'left',
    alignSelf: 'flex-start',
    paddingRight: 0,
    paddingLeft: 4,
  },
  reportOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  reportOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  reportOverlayContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  reportOverlayContentIos: {
    justifyContent: 'flex-start',
    paddingTop: 32,
    paddingBottom: 12,
  },
  reportModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: Platform.OS === 'ios' ? '68%' : '88%',
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  reportModalScroll: {
    width: '100%',
  },
  reportModalScrollContent: {
    paddingBottom: 6,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportModalHeaderLtr: {
    flexDirection: 'row-reverse',
  },
  reportModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
  },
  reportModalTitleLtr: {
    textAlign: 'left',
  },
  reportModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportModalSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  reportModalSubtitleLtr: {
    textAlign: 'left',
  },
  reportReasonList: {
    marginTop: 14,
    gap: 10,
  },
  reportReasonButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  reportReasonButtonSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  reportReasonText: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
  },
  reportReasonTextLtr: {
    textAlign: 'left',
  },
  reportReasonTextSelected: {
    color: theme.colors.accent,
    fontWeight: '700',
  },
  reportTextInput: {
    minHeight: 100,
    marginTop: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    textAlignVertical: 'top',
  },
  reportTextInputLtr: {
    writingDirection: 'ltr',
  },
  reportSubmitButton: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  reportSubmitButtonDisabled: {
    opacity: 0.6,
  },
  reportSubmitButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
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
