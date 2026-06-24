import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
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
  image_path?: string | null;
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
  onScrollYChange?: (y: number) => void;
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
  expanded,
  onToggleExpand,
  canAddDish,
  onRequireLogin,
  onPreviewImage,
}: {
  group: RestaurantGroup;
  expanded: boolean;
  onToggleExpand: () => void;
  canAddDish: boolean;
  onRequireLogin: () => void;
  onPreviewImage: (
    imageUrl: string,
    imagePath: string | null,
    title: string,
    subtitle: string
  ) => void;
}) {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const expandedRef = useRef(expanded);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const canUseAndroidLayoutAnimation =
    Platform.OS === 'android' && !(global as any)?.nativeFabricUIManager;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    expandedRef.current = expanded;

    if (expanded) {
      return;
    }

    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setError(null);
    setCollapsedCategories(new Set());
    setMenuCategories([]);
  }, [expanded]);

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

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isCurrentRequest = () =>
      isMountedRef.current && expandedRef.current && requestIdRef.current === requestId;

    try {
      if (!isCurrentRequest()) return;
      setLoading(true);
      setError(null);
      const fallbackCategories = buildFallbackCategoriesFromDishes(group.items);

      if (!group.restaurantId) {
        if (isCurrentRequest()) {
          setMenuCategories(fallbackCategories);
        }
        return;
      }

      const cachedMenu = await loadCachedRestaurantMenu<MenuCategory[]>(group.restaurantId);
      if (cachedMenu?.length) {
        if (isCurrentRequest()) {
          setMenuCategories(cachedMenu);
          setLoading(false);
        }
        return;
      }

      if (fallbackCategories.length) {
        if (isCurrentRequest()) {
          setMenuCategories(fallbackCategories);
        }
      }

      const response = await fetch(
        `https://www.10bis.co.il/api/GetMenu?ResId=${group.restaurantId}&websiteID=10bis&domainID=10bis`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const menuText = await response.text();
      const menuData = JSON.parse(menuText);
      const mappedMenu = mapMenuToCategories(menuData);
      const safeMenu = mappedMenu.length > 0 ? mappedMenu : fallbackCategories;
      if (!isCurrentRequest()) return;
      setMenuCategories(safeMenu);
      await saveCachedRestaurantMenu(group.restaurantId, safeMenu);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return;
      }
      if (menuCategories.length === 0) {
        const fallbackCategories = buildFallbackCategoriesFromDishes(group.items);
        if (fallbackCategories.length > 0) {
          if (isCurrentRequest()) {
            setMenuCategories(fallbackCategories);
          }
        } else {
          if (isCurrentRequest()) {
            setError(t('authGenericError'));
          }
        }
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (isCurrentRequest()) {
        setLoading(false);
      }
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
  const hasReviewedSection = summaries.some((item) => item.hasUploads);

  const collapseAllSections = useCallback(() => {
    animateLayout();
    const next = new Set<string>();
    if (hasReviewedSection) {
      next.add('reviewed');
    }
    menuCategories.forEach((category) => next.add(category.id));
    setCollapsedCategories(next);
  }, [animateLayout, hasReviewedSection, menuCategories]);

  const expandAllSections = useCallback(() => {
    animateLayout();
    setCollapsedCategories(new Set());
  }, [animateLayout]);

  useEffect(() => {
    if (expanded) {
      void loadMenu();
    }
  }, [expanded, loadMenu]);

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
  const totalSectionCount = menuCategories.length + (hasReviewedSection ? 1 : 0);
  const canToggleAllSections = totalSectionCount > 1;
  const allSectionsCollapsed =
    canToggleAllSections && collapsedCategories.size === totalSectionCount;
  const openDish = useCallback(
    (dish: DishSummary) => {
      if (dish.hasUploads) {
        router.push({
          pathname: '/dish',
          params: {
            dishId: dish.key,
            restaurantId: group.restaurantId ? String(group.restaurantId) : '',
            restaurantName: group.restaurantName,
            dishName: dish.name,
            dishQuery: dish.name,
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
          dishId: dish.key,
          dishName: dish.name,
          defaultImageUrl: dish.imageUrl ?? '',
          lockSelection: '1',
        },
      });
    },
    [canAddDish, group.restaurantId, group.restaurantName, onRequireLogin]
  );

  return (
    <View style={styles.accordionWrap}>
      <Pressable
        style={({ pressed }) => [
          styles.restaurantCard,
          !isRTL && styles.restaurantCardLtr,
          pressed && styles.restaurantCardPressed,
        ]}
        onPress={onToggleExpand}
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

      {expanded ? (
        <View style={styles.restaurantPanel}>
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
              {canToggleAllSections ? (
                <View style={[styles.panelControlsRow, !isRTL && styles.panelControlsRowLtr]}>
                  <Pressable
                    style={[
                      styles.panelControlButton,
                      allSectionsCollapsed && styles.panelControlButtonActive,
                    ]}
                    onPress={collapseAllSections}
                  >
                    <Text
                      style={[
                        styles.panelControlText,
                        allSectionsCollapsed && styles.panelControlTextActive,
                      ]}
                    >
                      {t('searchCollapseAll')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.panelControlButton,
                      !allSectionsCollapsed && styles.panelControlButtonActive,
                    ]}
                    onPress={expandAllSections}
                  >
                    <Text
                      style={[
                        styles.panelControlText,
                        !allSectionsCollapsed && styles.panelControlTextActive,
                      ]}
                    >
                      {t('searchExpandAll')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
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
                    onPress={() => openDish(item.dish)}
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
                      onPress={() => openDish(item.dish)}
                      onLongPress={() => {
                        if (!item.dish.imageUrl) return;
                        onPreviewImage(
                          item.dish.imageUrl,
                          item.dish.imagePath ?? null,
                          item.dish.name,
                          group.restaurantName
                        );
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
                          <CachedLogo
                            uri={item.dish.imageUrl}
                            imagePath={item.dish.imagePath ?? null}
                            style={styles.image}
                            preferNative
                          />
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
  onScrollYChange,
}: Props) {
  const { isRTL, t } = useLocale();
  const [expandedRestaurantKey, setExpandedRestaurantKey] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    imageUrl: string | null;
    imagePath: string | null;
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
      <ScrollView
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
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          onScrollYChange?.(event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={32}
      >
        {listHeader ? <View style={styles.listHeaderComponent}>{listHeader}</View> : null}
        {restaurantGroups.length === 0 && hasLoaded ? (
          <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>
            {t('restaurantsTabEmpty')}
          </Text>
        ) : (
          restaurantGroups.map((item, index) => (
            <View key={item.key} style={index > 0 ? styles.restaurantSeparator : undefined}>
              <RestaurantAccordionItem
                group={item}
                expanded={expandedRestaurantKey === item.key}
                onToggleExpand={() =>
                  setExpandedRestaurantKey((current) => (current === item.key ? null : item.key))
                }
                canAddDish={canAddDish}
                onRequireLogin={onRequireLogin}
                onPreviewImage={(imageUrl, imagePath, title, subtitle) =>
                  setImagePreview({ imageUrl, imagePath, title, subtitle })
                }
              />
            </View>
          ))
        )}
      </ScrollView>
      <ImagePreviewModal
        visible={Boolean(imagePreview?.imageUrl)}
        imageUrl={imagePreview?.imageUrl ?? null}
        imagePath={imagePreview?.imagePath ?? null}
        title={imagePreview?.title ?? null}
        subtitle={imagePreview?.subtitle ?? null}
        onClose={() => setImagePreview(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 180,
  },
  screenStateWrap: {
    gap: 14,
    paddingBottom: 180,
  },
  listHeaderComponent: {
    marginBottom: -15,
  },
  accordionWrap: {
    gap: 10,
  },
  restaurantSeparator: {
    marginTop: 14,
  },
  restaurantCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(217, 193, 170, 0.72)',
    backgroundColor: 'rgba(255, 250, 246, 0.96)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#9a6b3f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
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
  panelRows: {
    gap: 14,
  },
  panelControlsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  panelControlsRowLtr: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  panelControlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    backgroundColor: 'rgba(255,248,242,0.70)',
    minWidth: 88,
  },
  panelControlButtonActive: {
    borderColor: 'rgba(244,135,34,0.40)',
    backgroundColor: 'rgba(255,241,224,0.96)',
  },
  panelControlText: {
    fontSize: 10,
    fontFamily: theme.typography.semibold,
    color: theme.colors.textMuted,
  },
  panelControlTextActive: {
    color: theme.colors.accent,
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(219, 197, 176, 0.60)',
    backgroundColor: 'rgba(255, 250, 245, 0.92)',
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
    fontSize: 14,
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
