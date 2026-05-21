import {
  Animated,
  AppState,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CachedLogo from '../components/CachedLogo';
import CrossfadeView from '../components/CrossfadeView';
import ImagePreviewModal from '../components/ImagePreviewModal';
import { RestaurantScreenSkeleton } from '../components/LoadingSkeleton';
import RatingValueRow from '../components/RatingValueRow';
import StaggeredEntrance from '../components/StaggeredEntrance';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import {
  fetchCompanyIdForUser,
  fetchCompanyUserIds,
  fetchGlobalCompanyContext,
  fetchVisibleDishes,
  loadCachedRestaurantMenu,
  mergeCompanyVisibleRows,
  saveCachedRestaurantMenu,
} from '../lib/appData';
import { useFocusEffect } from '@react-navigation/native';
import { useLocale } from '../lib/locale';
import {
  buildFallbackCategoriesFromDishes,
  buildRowsFromMenu,
  type DishSummary,
  mapMenuToCategories,
  type MenuCategory,
  summarizeMenuDishes,
} from '../lib/restaurantMenu';

type DishAssociation = {
  id: string;
  user_id?: string | null;
  dish_id: number | null;
  dish_name: string | null;
  restaurant_id?: number | null;
  image_url: string | null;
  cuisine: string | null;
  tasty_score: number | null;
  filling_score: number | null;
  created_at: string | null;
};

type Row =
  | { type: 'header'; id: string; title: string }
  | { type: 'dish'; id: string; dish: DishSummary };

function SectionChevron({ collapsed }: { collapsed: boolean }) {
  const rotation = useRef(new Animated.Value(collapsed ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: collapsed ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [collapsed, rotation]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="chevron-down" size={14} color={theme.colors.accent} />
    </Animated.View>
  );
}

export default function RestaurantScreen() {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const params = useLocalSearchParams();
  const restaurantId =
    typeof params.restaurantId === 'string' && params.restaurantId
      ? Number(params.restaurantId)
      : null;
  const restaurantName =
    typeof params.restaurantName === 'string' ? params.restaurantName : '';

  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<DishSummary[]>([]);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dishSearch, setDishSearch] = useState('');
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string | null;
    title: string | null;
    subtitle: string | null;
  } | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const loadRestaurantData = useCallback(async () => {
    if (!restaurantId) {
      setError('חסרה מסעדה');
      setSummaries([]);
      setMenuCategories([]);
      setHasLoaded(true);
      return;
    }
    try {
      setHasLoaded(false);
      setLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      const userEmail = sessionData.session?.user?.email ?? null;
      const cachedMenu = await loadCachedRestaurantMenu<MenuCategory[]>(restaurantId);
      const fetchMenuPromise = fetch(
        `https://www.10bis.co.il/api/GetMenu?ResId=${restaurantId}&websiteID=10bis&domainID=10bis`,
        { headers: { Accept: 'application/json' } }
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Request failed: ${response.status}`);
          const menuText = await response.text();
          const menuData = JSON.parse(menuText);
          const mappedMenu = mapMenuToCategories(menuData);
          await saveCachedRestaurantMenu(restaurantId, mappedMenu);
          return mappedMenu;
        })
        .catch(() => cachedMenu ?? []);

      const curatedMenu = cachedMenu ?? (await fetchMenuPromise);
      setMenuCategories(curatedMenu);
      setCollapsedCategories(new Set());

      let list: DishAssociation[] = [];
      let hasScopedSource = false;
      if (userId) {
        const companyId = await fetchCompanyIdForUser(userId);
        if (companyId) {
          hasScopedSource = true;
          const emailDomain = userEmail?.includes('@')
            ? userEmail.split('@').pop()?.trim().toLowerCase() ?? null
            : null;
          const companyUserIds = await fetchCompanyUserIds(companyId, emailDomain);
          const [globalContext, visibleRowsRaw] = await Promise.all([
            fetchGlobalCompanyContext(),
            fetchVisibleDishes(companyId),
          ]);
          const visibleRows = (visibleRowsRaw as DishAssociation[]).filter((row) => row.restaurant_id === restaurantId);
          const { data: ownRows, error: ownRowsError } =
            companyUserIds.length > 0
              ? await supabase
                  .from('dish_associations')
                  .select(
                    'id, user_id, dish_id, dish_name, image_url, cuisine, tasty_score, filling_score, created_at, restaurant_id'
                  )
                  .eq('restaurant_id', restaurantId)
                  .in('user_id', companyUserIds)
              : { data: [], error: null };
          list = mergeCompanyVisibleRows(
            visibleRows,
            !ownRowsError && Array.isArray(ownRows) ? (ownRows as DishAssociation[]) : [],
            companyUserIds,
            globalContext?.userId ?? null
          );
        }
      }

      if (list.length === 0 && !hasScopedSource) {
        const { data, error: fetchError } = await supabase
          .from('dish_associations')
          .select(
            'id, user_id, dish_id, dish_name, image_url, cuisine, tasty_score, filling_score, created_at, restaurant_id'
          )
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false });
        if (fetchError) throw fetchError;
        list = (data as DishAssociation[]) ?? [];
      }
      const safeMenu = curatedMenu.length > 0 ? curatedMenu : buildFallbackCategoriesFromDishes(list);
      setMenuCategories(safeMenu);
      setSummaries(summarizeMenuDishes(safeMenu, list));
      if (cachedMenu) {
        const refreshedMenu = await fetchMenuPromise;
        const menuChanged = JSON.stringify(refreshedMenu) !== JSON.stringify(cachedMenu);
        if (menuChanged) {
          const refreshedSafeMenu =
            refreshedMenu.length > 0 ? refreshedMenu : buildFallbackCategoriesFromDishes(list);
          setMenuCategories(refreshedSafeMenu);
          setCollapsedCategories(new Set());
          setSummaries(summarizeMenuDishes(refreshedSafeMenu, list));
        }
      }
    } catch {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadRestaurantData();
  }, [loadRestaurantData]);

  const refreshContent = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadRestaurantData();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadRestaurantData]);

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

  const rows = useMemo(
    () =>
      buildRowsFromMenu(
        menuCategories,
        summaries,
        collapsedCategories,
        t('restaurantWithReviews'),
        dishSearch
      ),
    [menuCategories, summaries, collapsedCategories, dishSearch, t]
  );

  const animateSectionChange = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }, []);

  const toggleSection = useCallback(
    (sectionKey: string) => {
      animateSectionChange();
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(sectionKey)) {
          next.delete(sectionKey);
        } else {
          next.add(sectionKey);
        }
        return next;
      });
    },
    [animateSectionChange]
  );

  const collapseAllSections = useCallback(() => {
    animateSectionChange();
    const all = new Set<string>();
    all.add('reviewed');
    menuCategories.forEach((cat) => all.add(cat.id));
    setCollapsedCategories(all);
  }, [animateSectionChange, menuCategories]);

  const expandAllSections = useCallback(() => {
    animateSectionChange();
    setCollapsedCategories(new Set());
  }, [animateSectionChange]);

  const allSectionsCollapsed =
    menuCategories.length > 0 &&
    collapsedCategories.size === menuCategories.length + (summaries.some((dish) => dish.hasUploads) ? 1 : 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.headerRow, !isRTL && styles.headerRowLtr]}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, !isRTL && styles.headerTitleLtr]}>
          {restaurantName || 'מסעדה'}
        </Text>
      </View>
      <View style={[styles.searchBox, !isRTL && styles.searchBoxLtr]}>
        <Ionicons name="search" size={16} color={theme.colors.accent} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('homeSearchPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          value={dishSearch}
          onChangeText={setDishSearch}
          textAlign={isRTL ? 'right' : 'left'}
        />
        {dishSearch.trim().length > 0 ? (
          <Pressable style={styles.searchClear} onPress={() => setDishSearch('')} hitSlop={6}>
            <Ionicons name="close" size={16} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {menuCategories.length > 0 ? (
        <View style={[styles.controlsRow, !isRTL && styles.controlsRowLtr]}>
          <Pressable
            style={[
              styles.controlButton,
              allSectionsCollapsed && styles.controlButtonActive,
            ]}
            onPress={collapseAllSections}
          >
            <Text
              style={[
                styles.controlText,
                allSectionsCollapsed && styles.controlTextActive,
              ]}
            >
              {t('searchCollapseAll')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.controlButton,
              !allSectionsCollapsed && styles.controlButtonActive,
            ]}
            onPress={expandAllSections}
          >
            <Text
              style={[
                styles.controlText,
                !allSectionsCollapsed && styles.controlTextActive,
              ]}
            >
              {t('searchExpandAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !isRefreshing ? (
        <CrossfadeView style={styles.results}>
          <RestaurantScreenSkeleton />
        </CrossfadeView>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : rows.length === 0 && hasLoaded ? (
        <View style={styles.results}>
          <Text style={[styles.placeholderText, !isRTL && styles.placeholderTextLtr]}>
            אין מנות להצגה
          </Text>
        </View>
      ) : (
        <CrossfadeView>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refreshContent}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
              />
            }
            renderItem={({ item, index }) =>
              item.type === 'header' ? (
                <Pressable
                  style={[styles.sectionHeader, !isRTL && styles.sectionHeaderLtr]}
                  onPress={() => toggleSection(item.id.replace('header-', ''))}
                >
                  <Text style={[styles.sectionHeaderText, !isRTL && styles.sectionHeaderTextLtr]}>
                    {item.title}
                  </Text>
                  <SectionChevron collapsed={collapsedCategories.has(item.id.replace('header-', ''))} />
                </Pressable>
              ) : (
                <StaggeredEntrance index={index}>
                  <Pressable
                    style={[styles.dishCard, !isRTL && styles.dishCardLtr]}
                    onPress={() => {
                      if (item.dish.hasUploads) {
                        router.push({
                          pathname: '/dish',
                          params: {
                            restaurantId: restaurantId ? String(restaurantId) : '',
                            restaurantName,
                            dishName: item.dish.name,
                            dishQuery: item.dish.name,
                          },
                        });
                        return;
                      }

                      router.push({
                        pathname: '/camera/details',
                        params: {
                          restaurantId: restaurantId ? String(restaurantId) : '',
                          restaurantName,
                          dishId: item.dish.key,
                          dishName: item.dish.name,
                          defaultImageUrl: item.dish.imageUrl ?? '',
                          lockSelection: '1',
                        },
                      });
                    }}
                  >
                    <View style={[styles.dishInfo, !isRTL && styles.dishInfoLtr]}>
                      <Text style={[styles.dishName, !isRTL && styles.dishNameLtr]}>{item.dish.name}</Text>
                      {!item.dish.hasUploads ? (
                        <View style={styles.statusBadge}>
                          <Text style={[styles.statusBadgeText, !isRTL && styles.statusBadgeTextLtr]}>
                            אין עדיין ביקורות
                          </Text>
                        </View>
                      ) : null}
                      <View style={[styles.scoreRow, !isRTL && styles.scoreRowLtr]}>
                        <View
                          style={[
                            styles.scoreItem,
                            !isRTL && styles.scoreItemLtr,
                            !item.dish.hasUploads && styles.scoreItemMuted,
                          ]}
                        >
                          <RatingValueRow
                            label={t('ratingTasty')}
                            score={item.dish.avgTasty}
                            iconSize={isRTL ? 24 : 22}
                            rowStyle={[styles.ratingInlineRow, !isRTL && styles.ratingInlineRowLtr]}
                            labelStyle={[styles.scoreLabel, !isRTL && styles.scoreLabelLtr]}
                          />
                        </View>
                        <View
                          style={[
                            styles.scoreItem,
                            !isRTL && styles.scoreItemLtr,
                            !item.dish.hasUploads && styles.scoreItemMuted,
                          ]}
                        >
                          <RatingValueRow
                            label={t('ratingSize')}
                            score={item.dish.avgFilling}
                            iconSize={isRTL ? 24 : 22}
                            rowStyle={[styles.ratingInlineRow, !isRTL && styles.ratingInlineRowLtr]}
                            labelStyle={[styles.scoreLabel, !isRTL && styles.scoreLabelLtr]}
                          />
                        </View>
                      </View>
                    </View>
                    <Pressable
                      style={styles.imageWrap}
                      disabled={!item.dish.imageUrl}
                      onLongPress={() => {
                        if (!item.dish.imageUrl) return;
                        setImagePreview({
                          imageUrl: item.dish.imageUrl,
                          title: item.dish.name,
                          subtitle: restaurantName,
                        });
                      }}
                      delayLongPress={180}
                    >
                      {item.dish.imageUrl ? (
                        <View style={styles.imageStackWrap}>
                          {item.dish.reviewCount > 1 ? (
                            <>
                              <View style={[styles.imageStackLayer, styles.imageStackLayerBack]} />
                              <View style={[styles.imageStackLayer, styles.imageStackLayerMid]} />
                            </>
                          ) : null}
                          <CachedLogo uri={item.dish.imageUrl} style={styles.image} />
                          {item.dish.reviewCount > 1 ? (
                            <View style={styles.multiReviewBadge}>
                              <Ionicons name="copy-outline" size={10} color={theme.colors.white} />
                              <Text style={styles.multiReviewBadgeText}>{item.dish.reviewCount}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View style={styles.placeholderImage}>
                          <Ionicons
                            name="image-outline"
                            size={20}
                            color={theme.colors.textMuted}
                          />
                          <View style={[styles.placeholderOverlay, !isRTL && styles.placeholderOverlayLtr]}>
                            <Ionicons name="camera" size={10} color="#ffffff" />
                            <Text style={styles.placeholderOverlayText}>צלם מנה</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  </Pressable>
                </StaggeredEntrance>
              )
            }
          />
        </CrossfadeView>
      )}
      <ImagePreviewModal
        visible={Boolean(imagePreview?.imageUrl)}
        imageUrl={imagePreview?.imageUrl ?? null}
        title={imagePreview?.title ?? null}
        subtitle={imagePreview?.subtitle ?? null}
        onClose={() => setImagePreview(null)}
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
  headerTitle: {
    fontSize: 18,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  headerTitleLtr: {
    textAlign: 'left',
    marginRight: 0,
    marginLeft: 8,
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#F3F3F3',
    alignSelf: 'center',
    width: '82%',
    marginBottom: 14,
  },
  searchBoxLtr: {
    flexDirection: 'row',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
    textAlign: 'right',
  },
  searchClear: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: theme.colors.white,
  },
  controlsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 8,
  },
  controlsRowLtr: {
    flexDirection: 'row',
  },
  controlButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
  },
  controlButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  controlText: {
    fontSize: 12,
    fontFamily: theme.typography.semibold,
    color: theme.colors.textMuted,
  },
  controlTextActive: {
    color: theme.colors.accent,
  },
  listContent: {
    paddingBottom: 120,
    gap: 14,
  },
  sectionHeader: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLtr: {
    flexDirection: 'row',
  },
  sectionHeaderText: {
    fontSize: 12,
    fontFamily: theme.typography.bold,
    color: theme.colors.accent,
    textAlign: 'right',
  },
  sectionHeaderTextLtr: {
    textAlign: 'left',
  },
  dishCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
  },
  dishCardLtr: {
    flexDirection: 'row',
  },
  dishInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dishInfoLtr: {
    alignItems: 'flex-start',
  },
  dishName: {
    fontSize: 16,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
    textAlign: 'right',
    marginBottom: 6,
  },
  dishNameLtr: {
    textAlign: 'left',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.cardAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: theme.typography.semibold,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  statusBadgeTextLtr: {
    textAlign: 'left',
  },
  scoreRow: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginRight: 22,
  },
  scoreRowLtr: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginRight: 0,
    marginLeft: 8,
    maxWidth: 156,
  },
  scoreItem: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  scoreItemLtr: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  scoreItemMuted: {
    opacity: 0.55,
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  ratingInlineRowLtr: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: 156,
  },
  scoreLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    minWidth: 62,
    textAlign: 'right',
    alignSelf: 'center',
    lineHeight: 24,
    paddingRight: 10,
  },
  scoreLabelLtr: {
    textAlign: 'left',
    paddingRight: 0,
    paddingLeft: 6,
    minWidth: 48,
  },
  imageWrap: {
    width: 110,
    height: 76,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.cardAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageStackWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  imageStackLayer: {
    position: 'absolute',
    inset: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  imageStackLayerBack: {
    top: 6,
    left: 8,
    right: -8,
    bottom: -6,
    opacity: 0.38,
  },
  imageStackLayerMid: {
    top: 3,
    left: 4,
    right: -4,
    bottom: -3,
    opacity: 0.56,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    borderRadius: 12,
  },
  multiReviewBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  multiReviewBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontFamily: theme.typography.bold,
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  placeholderOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  placeholderOverlayLtr: {
    flexDirection: 'row',
  },
  placeholderOverlayText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
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
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'right',
  },
  placeholderTextLtr: {
    textAlign: 'left',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'right',
  },
});
