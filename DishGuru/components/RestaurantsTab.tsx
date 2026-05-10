import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import CachedLogo from './CachedLogo';
import { RestaurantScreenSkeleton } from './LoadingSkeleton';
import RatingValueRow from './RatingValueRow';
import {
  loadCachedRestaurantMenu,
  saveCachedRestaurantMenu,
} from '../lib/appData';
import { useLocale } from '../lib/locale';
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

type MenuDish = {
  id: number;
  name: string;
};

type MenuCategory = {
  id: string;
  name: string;
  items: MenuDish[];
};

type DishSummary = {
  key: string;
  name: string;
  imageUrl: string | null;
  avgTasty: number;
  avgFilling: number;
  cuisine: string;
  hasUploads: boolean;
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

const normalizeCategoryName = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeDishName = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeDishLookup = (raw: unknown) => {
  const name = normalizeDishName(raw);
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeDishId = (raw: unknown) => {
  if (typeof raw === 'number') return raw;
  return null;
};

const mapMenuToCategories = (data: any): MenuCategory[] => {
  const categories: any[] = Array.isArray(data?.Data)
    ? data.Data
    : Array.isArray(data?.Data?.Categories)
      ? data.Data.Categories
      : [];

  const categoryMap = new Map<string, MenuCategory>();
  const ensureCategory = (id: string, name: string) => {
    if (!categoryMap.has(id)) {
      categoryMap.set(id, { id, name, items: [] });
    }
    return categoryMap.get(id)!;
  };

  categories.forEach((cat) => {
    const categoryName =
      normalizeCategoryName(cat?.CategoryName) ??
      normalizeCategoryName(cat?.Name) ??
      normalizeCategoryName(cat?.CategoryTitle);
    const categoryIdRaw = normalizeCategoryName(cat?.CategoryId ?? cat?.Id ?? cat?.CategoryID);
    const categoryId = categoryIdRaw ?? categoryName ?? 'uncategorized';
    const safeName = categoryName ?? 'קטגוריה';

    const dishesArr = Array.isArray(cat?.DishList)
      ? cat.DishList
      : Array.isArray(cat?.Dishes)
        ? cat.Dishes
        : [];

    const bucket = ensureCategory(categoryId, safeName);
    dishesArr.forEach((d: any) => {
      const name = normalizeDishName(d?.DishName) ?? normalizeDishName(d?.Name);
      const id =
        normalizeDishId(d?.DishId) ??
        normalizeDishId(d?.Id) ??
        normalizeDishId(d?.DishID);
      if (!name || id === null) return;
      bucket.items.push({ id, name });
    });
  });

  if (categoryMap.size === 0 && Array.isArray(data?.Data?.Dishes)) {
    const bucket = ensureCategory('uncategorized', 'קטגוריה');
    data.Data.Dishes.forEach((d: any) => {
      const name = normalizeDishName(d?.DishName) ?? normalizeDishName(d?.Name);
      const id =
        normalizeDishId(d?.DishId) ??
        normalizeDishId(d?.Id) ??
        normalizeDishId(d?.DishID);
      if (!name || id === null) return;
      bucket.items.push({ id, name });
    });
  }

  return Array.from(categoryMap.values()).filter((cat) => cat.items.length > 0);
};

const buildFallbackCategoriesFromDishes = (dishes: DishAssociation[]): MenuCategory[] => {
  const seen = new Map<string, MenuDish>();
  dishes.forEach((dish) => {
    const name = normalizeDishName(dish.dish_name);
    if (!name) return;
    const key = normalizeDishLookup(name) ?? name;
    if (!seen.has(key)) {
      seen.set(key, {
        id: dish.dish_id ?? seen.size + 1,
        name,
      });
    }
  });

  if (seen.size === 0) return [];

  return [
    {
      id: 'fallback-menu',
      name: 'מנות',
      items: Array.from(seen.values()).sort((left, right) =>
        left.name.localeCompare(right.name, 'he')
      ),
    },
  ];
};

const summarizeMenuDishes = (categories: MenuCategory[], list: DishAssociation[]) => {
  const uniqueMenuDishes = new Map<
    string,
    { name: string; ids: Set<number>; primaryId: number }
  >();

  categories.forEach((category) => {
    category.items.forEach((dish) => {
      const normalizedName = normalizeDishLookup(dish.name) ?? `dish:${dish.id}`;
      if (!uniqueMenuDishes.has(normalizedName)) {
        uniqueMenuDishes.set(normalizedName, {
          name: dish.name,
          ids: new Set([dish.id]),
          primaryId: dish.id,
        });
      } else {
        uniqueMenuDishes.get(normalizedName)!.ids.add(dish.id);
      }
    });
  });

  return Array.from(uniqueMenuDishes.values()).map((menuDish) => {
    const normalizedMenuName = normalizeDishLookup(menuDish.name);
    const matchingRows = list.filter((row) => {
      if (row.dish_id !== null && menuDish.ids.has(row.dish_id)) {
        return true;
      }
      if (!normalizedMenuName) return false;
      const normalizedRowName = normalizeDishLookup(row.dish_name);
      if (!normalizedRowName) return false;
      return normalizedRowName === normalizedMenuName;
    });

    let tastySum = 0;
    let tastyCount = 0;
    let fillingSum = 0;
    let fillingCount = 0;
    let imageUrl: string | null = null;
    let latestCreatedAt = 0;

    matchingRows.forEach((row) => {
      if (typeof row.tasty_score === 'number') {
        tastySum += row.tasty_score;
        tastyCount += 1;
      }
      if (typeof row.filling_score === 'number') {
        fillingSum += row.filling_score;
        fillingCount += 1;
      }
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (createdAt >= latestCreatedAt) {
        latestCreatedAt = createdAt;
        imageUrl = row.image_url ?? imageUrl;
      }
    });

    return {
      key: String(menuDish.primaryId),
      name: menuDish.name,
      imageUrl,
      avgTasty: tastyCount ? tastySum / tastyCount : 0,
      avgFilling: fillingCount ? fillingSum / fillingCount : 0,
      cuisine: 'ללא מטבח',
      hasUploads: matchingRows.length > 0,
    };
  });
};

const buildRowsFromMenu = (
  categories: MenuCategory[],
  summaries: DishSummary[],
  collapsed: Set<string>,
  reviewedSectionTitle: string
): Row[] => {
  const rows: Row[] = [];
  const reviewedSectionKey = 'reviewed';
  const byDishId = new Map<number, DishSummary>();
  const byDishName = new Map<string, DishSummary>();
  const seenReviewedKeys = new Set<string>();

  summaries.forEach((dish) => {
    const normalizedName = normalizeDishLookup(dish.name);
    if (normalizedName) byDishName.set(normalizedName, dish);
    const id = Number(dish.key);
    if (!Number.isNaN(id) && !byDishId.has(id)) byDishId.set(id, dish);
  });

  const reviewedDishes = summaries
    .filter((dish) => dish.hasUploads)
    .sort((left, right) => left.name.localeCompare(right.name, 'he'));

  if (reviewedDishes.length > 0) {
    rows.push({ type: 'header', id: `header-${reviewedSectionKey}`, title: reviewedSectionTitle });
    if (!collapsed.has(reviewedSectionKey)) {
      reviewedDishes.forEach((dish) => {
        const reviewedKey = normalizeDishLookup(dish.name) ?? dish.key;
        seenReviewedKeys.add(reviewedKey);
        rows.push({
          type: 'dish',
          id: `reviewed-${dish.key}`,
          dish,
        });
      });
    }
  }

  categories.forEach((cat) => {
    rows.push({ type: 'header', id: `header-${cat.id}`, title: cat.name });
    if (collapsed.has(cat.id)) return;
    cat.items.forEach((dish) => {
      const summary =
        byDishName.get(normalizeDishLookup(dish.name) ?? '') ?? byDishId.get(dish.id);
      const normalizedDish = normalizeDishLookup(dish.name) ?? String(dish.id);
      if (summary?.hasUploads && seenReviewedKeys.has(normalizedDish)) {
        return;
      }
      rows.push({
        type: 'dish',
        id: `${cat.id}-${dish.id}`,
        dish: {
          key: String(dish.id),
          name: dish.name,
          imageUrl: summary?.imageUrl ?? null,
          avgTasty: summary?.avgTasty ?? 0,
          avgFilling: summary?.avgFilling ?? 0,
          cuisine: summary?.cuisine ?? 'ללא מטבח',
          hasUploads: summary?.hasUploads ?? false,
        },
      });
    });
  });

  return rows;
};

function RestaurantAccordionItem({
  group,
  canAddDish,
  onRequireLogin,
}: {
  group: RestaurantGroup;
  canAddDish: boolean;
  onRequireLogin: () => void;
}) {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const animateLayout = useCallback(() => {
    if (Platform.OS === 'ios') {
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
  }, []);

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
                            dishId: item.dish.key,
                            dishName: item.dish.name,
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
                    <View style={styles.imageWrap}>
                      {item.dish.imageUrl ? (
                        <CachedLogo uri={item.dish.imageUrl} style={styles.image} />
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
                    </View>
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
}: Props) {
  const { isRTL, t } = useLocale();

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

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
    return <RestaurantScreenSkeleton />;
  }

  if (error) {
    return <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>{error}</Text>;
  }

  if (restaurantGroups.length === 0 && hasLoaded) {
    return (
      <Text style={[styles.stateText, !isRTL && styles.stateTextLtr]}>
        {t('restaurantsTabEmpty')}
      </Text>
    );
  }

  return (
    <View style={styles.content}>
      {restaurantGroups.map((group) => (
        <RestaurantAccordionItem
          key={group.key}
          group={group}
          canAddDish={canAddDish}
          onRequireLogin={onRequireLogin}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
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
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
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
    left: 8,
    bottom: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
