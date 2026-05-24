import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import CachedLogo from './CachedLogo';
import ImagePreviewModal from './ImagePreviewModal';
import { RestaurantScreenSkeleton } from './LoadingSkeleton';
import RatingValueRow from './RatingValueRow';
import {
  loadCachedRestaurantMenu,
  saveCachedRestaurantMenu,
} from '../lib/appData';
import { useLocale } from '../lib/locale';
import {
  buildFallbackCategoriesFromDishes,
  buildRowsFromMenu,
  type DishSummary,
  mapMenuToCategories,
  type MenuCategory,
  normalizeDishLookup,
  summarizeMenuDishes,
} from '../lib/restaurantMenu';
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
  created_at: string | null;
};

type Row =
  | { type: 'header'; id: string; title: string }
  | { type: 'dish'; id: string; dish: DishSummary };

type RestaurantGroup = {
  key: string;
  restaurantId: number | null;
  restaurantName: string;
  items: DishAssociation[];
};

type Props = {
  dishes: DishAssociation[];
  loading: boolean;
  hasLoaded: boolean;
  error: string | null;
  canAddDish: boolean;
  onRequireLogin: () => void;
  searchQuery: string;
  listHeader?: React.ReactElement | null;
  isRefreshing: boolean;
  onRefresh: () => void;
};

function SectionChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? 'chevron-down' : 'chevron-up'}
      size={16}
      color={theme.colors.accent}
    />
  );
}

function RestaurantAccordionItem({
  group,
  canAddDish,
  onRequireLogin,
  onPreviewImage,
}: {
  group: RestaurantGroup;
  canAddDish: boolean;
  onRequireLogin: () => void;
  onPreviewImage: (imageUrl: string, title: string, subtitle: string) => void;
}) {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const canUseAndroidLayoutAnimation =
    Platform.OS === 'android' && !(global as any)?.nativeFabricUIManager;

  const animateLayout = useCallback(() => {
    if (Platform.OS === 'ios') {
      return;
    }
    if (!canUseAndroidLayoutAnimation) {
      return;
    }
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
  }, [canUseAndroidLayoutAnimation]);

  const loadMenu = useCallback(async () => {
    if (menuCategories.length > 0 || loading) return;

    try {
      setLoading(true);
      setError(null);
      const fallbackCategories = buildFallbackCategoriesFromDishes(group.items);

      if (!group.restaurantId) {
        setMenuCategories(fallbackCategories);
        return;
      }

      const cachedMenu = await loadCachedRestaurantMenu<MenuCategory[]>(group.restaurantId);
      if (cachedMenu?.length) {
        setMenuCategories(cachedMenu);
      } else if (fallbackCategories.length) {
        setMenuCategories(fallbackCategories);
      }

      const response = await fetch(
        `https://www.10bis.co.il/api/GetMenu?ResId=${group.restaurantId}&websiteID=10bis&domainID=10bis`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const menuText = await response.text();
      const menuData = JSON.parse(menuText);
      const mappedMenu = mapMenuToCategories(menuData);
      const safeMenu = mappedMenu.length > 0 ? mappedMenu : fallbackCategories;
      setMenuCategories(safeMenu);
      await saveCachedRestaurantMenu(group.restaurantId, safeMenu);
    } catch {
      if (menuCategories.length === 0) {
        const fallbackCategories = buildFallbackCategoriesFromDishes(group.items);
        if (fallbackCategories.length > 0) {
          setMenuCategories(fallbackCategories);
        } else {
          setError(t('authGenericError'));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [group.items, group.restaurantId, loading, menuCategories.length, t]);

  const summaries = useMemo(
    () => summarizeMenuDishes(menuCategories, group.items),
    [group.items, menuCategories]
  );

  const rows = useMemo(
    () => buildRowsFromMenu(menuCategories, summaries, collapsedCategories, t('restaurantWithReviews')),
    [collapsedCategories, menuCategories, summaries, t]
  );

  const toggleExpanded = useCallback(async () => {
    animateLayout();
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) {
      setHasOpenedOnce(true);
      await loadMenu();
    }
  }, [animateLayout, expanded, loadMenu]);

  const toggleSection = useCallback(
    (sectionKey: string) => {
      animateLayout();
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
    [animateLayout]
  );

  const ratedCount = summaries.filter((item) => item.hasUploads).length;
  const shouldRenderPanel = expanded || hasOpenedOnce || loading;

  return (
    <View style={styles.accordionWrap}>
      <Pressable
        style={({ pressed }) => [
          styles.restaurantCard,
          !isRTL && styles.restaurantCardLtr,
          pressed && styles.restaurantCardPressed,
        ]}
        onPress={() => void toggleExpanded()}
      >
        <View style={[styles.restaurantCardTextWrap, !isRTL && styles.restaurantCardTextWrapLtr]}>
          <Text style={[styles.restaurantCardTitle, !isRTL && styles.restaurantCardTitleLtr]}>
            {group.restaurantName}
          </Text>
          <Text style={[styles.restaurantCardMeta, !isRTL && styles.restaurantCardMetaLtr]}>
            {group.items.length} {t('homeTabDishes')} • {ratedCount} {t('restaurantWithReviews')}
          </Text>
        </View>
        <View style={styles.restaurantCardChevron}>
          <SectionChevron collapsed={!expanded} />
        </View>
      </Pressable>

      {shouldRenderPanel ? (
        <View
          style={[
            styles.restaurantPanel,
            expanded ? styles.restaurantPanelVisible : styles.restaurantPanelHidden,
          ]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          {loading && menuCategories.length === 0 ? (
            <RestaurantScreenSkeleton />
          ) : error ? (
            <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>{error}</Text>
          ) : rows.length === 0 ? (
            <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>
              {t('commonNoDishesToShow')}
            </Text>
          ) : (
            <View style={styles.panelRows}>
              {rows.map((item, index) =>
                item.type === 'header' ? (
                  <Pressable
                    key={item.id}
                    style={[styles.sectionHeader, !isRTL && styles.sectionHeaderLtr]}
                    onPress={() => toggleSection(item.id.replace('header-', ''))}
                  >
                    <Text style={[styles.sectionHeaderText, !isRTL && styles.sectionHeaderTextLtr]}>
                      {item.title}
                    </Text>
                    <SectionChevron
                      collapsed={collapsedCategories.has(item.id.replace('header-', ''))}
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    key={item.id}
                    style={[styles.dishCard, !isRTL && styles.dishCardLtr]}
                    onPress={() => {
                      if (item.dish.hasUploads) {
                        router.push({
                          pathname: '/dish',
                          params: {
                            restaurantId: group.restaurantId ? String(group.restaurantId) : '',
                            restaurantName: group.restaurantName,
                            dishName: item.dish.name,
                            dishQuery: item.dish.name,
                          },
                        });
                        return;
                      }

                      if (!canAddDish) {
                        onRequireLogin();
                        return;
                      }

                      router.push({
                        pathname: '/camera/details',
                        params: {
                          restaurantId: group.restaurantId ? String(group.restaurantId) : '',
                          restaurantName: group.restaurantName,
                          dishId: item.dish.key,
                          dishName: item.dish.name,
                          defaultImageUrl: item.dish.imageUrl ?? '',
                          lockSelection: '1',
                        },
                      });
                    }}
                  >
                    <View style={[styles.dishInfo, !isRTL && styles.dishInfoLtr]}>
                      <Text style={[styles.dishName, !isRTL && styles.dishNameLtr]}>
                        {item.dish.name}
                      </Text>
                      {!item.dish.hasUploads ? (
                        <View style={styles.statusBadge}>
                          <Text
                            style={[
                              styles.statusBadgeText,
                              !isRTL && styles.statusBadgeTextLtr,
                            ]}
                          >
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
                        onPreviewImage(item.dish.imageUrl, item.dish.name, group.restaurantName);
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
                          <View
                            style={[
                              styles.placeholderOverlay,
                              !isRTL && styles.placeholderOverlayLtr,
                            ]}
                          >
                            <Ionicons name="camera" size={10} color="#ffffff" />
                            <Text style={styles.placeholderOverlayText}>צלם מנה</Text>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  </Pressable>
                )
              )}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function RestaurantsTab({
  dishes,
  loading,
  hasLoaded,
  error,
  canAddDish,
  onRequireLogin,
  searchQuery,
  listHeader = null,
  isRefreshing,
  onRefresh,
}: Props) {
  const { isRTL, t } = useLocale();
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string | null;
    title: string | null;
    subtitle: string | null;
  } | null>(null);
  const canUseAndroidLayoutAnimation =
    Platform.OS === 'android' && !(global as any)?.nativeFabricUIManager;

  useEffect(() => {
    if (canUseAndroidLayoutAnimation) {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, [canUseAndroidLayoutAnimation]);

  const restaurantGroups = useMemo(() => {
    const normalizedQuery = normalizeDishLookup(searchQuery) ?? '';
    const grouped = new Map<string, DishAssociation[]>();
    dishes.forEach((item) => {
      const normalizedName = (item.restaurant_name ?? '').trim();
      if (!normalizedName && item.restaurant_id == null) return;
      const key =
        item.restaurant_id != null ? `rest:${item.restaurant_id}` : `name:${normalizedName.toLowerCase()}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    });

    const allGroups = Array.from(grouped.entries())
      .map(([key, items]) => ({
        key,
        restaurantId: items[0]?.restaurant_id ?? null,
        restaurantName:
          items[0]?.restaurant_name?.trim() ||
          (items[0]?.restaurant_id != null ? `מסעדה ${items[0].restaurant_id}` : 'מסעדה'),
        items: [...items].sort((left, right) => {
          const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
          const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
          return rightTime - leftTime;
        }),
      }))
      .sort((left, right) => left.restaurantName.localeCompare(right.restaurantName, 'he'));

    if (!normalizedQuery) {
      return allGroups;
    }

    return allGroups.filter((group) => {
      const normalizedRestaurant = normalizeDishLookup(group.restaurantName) ?? '';
      if (normalizedRestaurant.includes(normalizedQuery)) {
        return true;
      }

      return group.items.some((dish) => {
        const normalizedDish = normalizeDishLookup(dish.dish_name) ?? '';
        return normalizedDish.includes(normalizedQuery);
      });
    });
  }, [dishes, searchQuery]);

  if (loading && !hasLoaded) {
    return (
      <View style={styles.screenStateWrap}>
        {listHeader}
        <RestaurantScreenSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screenStateWrap}>
        {listHeader}
        <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={restaurantGroups}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <RestaurantAccordionItem
            group={item}
            canAddDish={canAddDish}
            onRequireLogin={onRequireLogin}
            onPreviewImage={(imageUrl, title, subtitle) =>
              setImagePreview({ imageUrl, title, subtitle })
            }
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          hasLoaded ? (
            <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>
              {t('restaurantsTabEmpty')}
            </Text>
          ) : null
        }
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
      />
      <ImagePreviewModal
        visible={Boolean(imagePreview?.imageUrl)}
        imageUrl={imagePreview?.imageUrl ?? null}
        title={imagePreview?.title ?? null}
        subtitle={imagePreview?.subtitle ?? null}
        onClose={() => setImagePreview(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingBottom: 180,
  },
  screenStateWrap: {
    gap: 14,
    paddingBottom: 180,
  },
  accordionWrap: {
    gap: 10,
  },
  restaurantCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  restaurantCardLtr: {
    flexDirection: 'row',
  },
  restaurantCardPressed: {
    opacity: 0.92,
  },
  restaurantCardTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  restaurantCardTextWrapLtr: {
    alignItems: 'flex-start',
  },
  restaurantCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
  },
  restaurantCardTitleLtr: {
    textAlign: 'left',
  },
  restaurantCardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  restaurantCardMetaLtr: {
    textAlign: 'left',
  },
  restaurantCardChevron: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantPanel: {
    paddingTop: 2,
  },
  restaurantPanelVisible: {
    opacity: 1,
    maxHeight: 5000,
    overflow: 'hidden',
  },
  restaurantPanelHidden: {
    opacity: 0,
    maxHeight: 0,
    overflow: 'hidden',
  },
  panelRows: {
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '600',
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
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  imageStackLayerBack: {
    left: 8,
    right: -8,
    top: 6,
    bottom: -6,
    opacity: 0.28,
  },
  imageStackLayerMid: {
    left: 4,
    right: -4,
    top: 3,
    bottom: -3,
    opacity: 0.42,
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  multiReviewBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(50, 34, 20, 0.82)',
  },
  multiReviewBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontFamily: theme.typography.bold,
    lineHeight: 12,
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
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '700',
  },
  stateText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'right',
    paddingHorizontal: 12,
    paddingVertical: 24,
  },
  stateTextLtr: {
    textAlign: 'left',
  },
});
