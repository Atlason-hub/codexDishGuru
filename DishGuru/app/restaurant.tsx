import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CachedLogo from '../components/CachedLogo';
import { RestaurantScreenSkeleton } from '../components/LoadingSkeleton';
import RatingValueRow from '../components/RatingValueRow';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import {
  fetchCompanyIdForUser,
  fetchVisibleDishes,
  loadCachedRestaurantMenu,
  saveCachedRestaurantMenu,
} from '../lib/appData';
import { useFocusEffect } from '@react-navigation/native';

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
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
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
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
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

const buildRowsFromMenu = (
  categories: MenuCategory[],
  summaries: DishSummary[],
  collapsed: Set<string>
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
    rows.push({ type: 'header', id: `header-${reviewedSectionKey}`, title: 'עם ביקורות' });
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
    let cuisine = 'ללא מטבח';
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
        cuisine = row.cuisine ?? cuisine;
      }
    });

    return {
      key: String(menuDish.primaryId),
      name: menuDish.name,
      imageUrl,
      avgTasty: tastyCount ? tastySum / tastyCount : 0,
      avgFilling: fillingCount ? fillingSum / fillingCount : 0,
      cuisine,
      hasUploads: matchingRows.length > 0,
    };
  });
};

export default function RestaurantScreen() {
  const router = useRouter();
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
  const appStateRef = useRef(AppState.currentState);

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
          list = ((await fetchVisibleDishes(companyId)) as DishAssociation[]).filter(
            (row) => row.restaurant_id === restaurantId
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
      setSummaries(summarizeMenuDishes(curatedMenu, list));
      if (cachedMenu) {
        const refreshedMenu = await fetchMenuPromise;
        const menuChanged = JSON.stringify(refreshedMenu) !== JSON.stringify(cachedMenu);
        if (menuChanged) {
          setMenuCategories(refreshedMenu);
          setCollapsedCategories(new Set());
          setSummaries(summarizeMenuDishes(refreshedMenu, list));
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
    () => buildRowsFromMenu(menuCategories, summaries, collapsedCategories),
    [menuCategories, summaries, collapsedCategories]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{restaurantName || 'מסעדה'}</Text>
      </View>
      {menuCategories.length > 0 ? (
        <View style={styles.controlsRow}>
          <Pressable
            style={styles.controlButton}
            onPress={() => {
              const all = new Set<string>();
              all.add('reviewed');
              menuCategories.forEach((cat) => all.add(cat.id));
              setCollapsedCategories(all);
            }}
          >
            <Text style={styles.controlText}>כווץ הכל</Text>
          </Pressable>
          <Pressable
            style={styles.controlButton}
            onPress={() => setCollapsedCategories(new Set())}
          >
            <Text style={styles.controlText}>הרחב הכל</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !isRefreshing ? (
        <View style={styles.results}>
          <RestaurantScreenSkeleton />
        </View>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : rows.length === 0 && hasLoaded ? (
        <View style={styles.results}>
          <Text style={styles.placeholderText}>אין מנות להצגה</Text>
        </View>
      ) : (
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
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <Pressable
                style={styles.sectionHeader}
                onPress={() =>
                  setCollapsedCategories((prev) => {
                    const next = new Set(prev);
                    const key = item.id.replace('header-', '');
                    if (next.has(key)) {
                      next.delete(key);
                    } else {
                      next.add(key);
                    }
                    return next;
                  })
                }
              >
                <Text style={styles.sectionHeaderText}>{item.title}</Text>
                <Ionicons
                  name={
                    collapsedCategories.has(item.id.replace('header-', ''))
                      ? 'chevron-down'
                      : 'chevron-up'
                  }
                  size={14}
                  color={theme.colors.accent}
                />
              </Pressable>
            ) : (
              <Pressable
                style={styles.dishCard}
                onPress={() => {
                  if (item.dish.hasUploads) {
                    router.push({
                      pathname: '/dish',
                      params: {
                        restaurantId: restaurantId ? String(restaurantId) : '',
                        restaurantName,
                        dishId: item.dish.key,
                        dishName: item.dish.name,
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
                <View style={styles.dishInfo}>
                  <Text style={styles.dishName}>{item.dish.name}</Text>
                  {!item.dish.hasUploads ? (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>אין עדיין ביקורות</Text>
                    </View>
                  ) : null}
                  <View style={styles.scoreRow}>
                    <View style={[styles.scoreItem, !item.dish.hasUploads && styles.scoreItemMuted]}>
                      <RatingValueRow
                        label="טעים"
                        score={item.dish.avgTasty}
                        iconSize={24}
                        rowStyle={styles.ratingInlineRow}
                        labelStyle={styles.scoreLabel}
                      />
                    </View>
                    <View style={[styles.scoreItem, !item.dish.hasUploads && styles.scoreItemMuted]}>
                      <RatingValueRow
                        label="משביע"
                        score={item.dish.avgFilling}
                        iconSize={24}
                        rowStyle={styles.ratingInlineRow}
                        labelStyle={styles.scoreLabel}
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
                      <View style={styles.placeholderOverlay}>
                        <Ionicons name="camera" size={10} color="#ffffff" />
                        <Text style={styles.placeholderOverlayText}>צלם מנה</Text>
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>
            )
          }
        />
      )}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  controlsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 8,
  },
  controlButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
  },
  controlText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
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
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.accent,
    textAlign: 'right',
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
  dishInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dishName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
    marginBottom: 6,
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
  scoreRow: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginRight: 22,
  },
  scoreItem: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
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
  scoreLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    minWidth: 62,
    textAlign: 'right',
    alignSelf: 'center',
    lineHeight: 24,
    paddingRight: 10,
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
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderOverlayText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '600',
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
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'right',
  },
});
