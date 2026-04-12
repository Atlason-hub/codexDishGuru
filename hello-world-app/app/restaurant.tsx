import {
  ActivityIndicator,
  AppState,
  FlatList,
  I18nManager,
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
import CachedLogo from '../components/CachedLogo';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { useFocusEffect } from '@react-navigation/native';
import { RATING_SVGS, getSelectedEmojiIndex, scoreToStars } from '../lib/ratings';

type DishAssociation = {
  id: string;
  dish_id: number | null;
  dish_name: string | null;
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
};

type Row =
  | { type: 'header'; id: string; title: string }
  | { type: 'dish'; id: string; dish: DishSummary };

const renderStars = (value: number) => {
  const indices = I18nManager.isRTL ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
  const selectedIndex = getSelectedEmojiIndex(value);
  return (
    <View style={[styles.starRow, I18nManager.isRTL && styles.starRowRtl]}>
      {indices.map((idx) => {
        const opacity = selectedIndex === idx ? 1 : 0.6;
        return (
          <SvgXml
            key={`face-${idx}`}
            xml={RATING_SVGS[idx]}
            width={24}
            height={24}
            style={[styles.emojiIcon, { opacity }]}
          />
        );
      })}
    </View>
  );
};

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
  const byDishId = new Map<number, DishSummary>();
  const byDishName = new Map<string, DishSummary>();
  summaries.forEach((dish) => {
    const id = Number(dish.key);
    if (!Number.isNaN(id)) byDishId.set(id, dish);
    byDishName.set(dish.name, dish);
  });

  categories.forEach((cat) => {
    rows.push({ type: 'header', id: `header-${cat.id}`, title: cat.name });
    if (collapsed.has(cat.id)) return;
    cat.items.forEach((dish) => {
      const summary = byDishId.get(dish.id) ?? byDishName.get(dish.name);
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
        },
      });
    });
  });

  return rows;
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
      const menuResponse = await fetch(
        `https://www.10bis.co.il/api/GetMenu?ResId=${restaurantId}&websiteID=10bis&domainID=10bis`,
        { headers: { Accept: 'application/json' } }
      );
      if (!menuResponse.ok) throw new Error(`Request failed: ${menuResponse.status}`);
      const menuText = await menuResponse.text();
      const menuData = JSON.parse(menuText);
      const curatedMenu = mapMenuToCategories(menuData);
      setMenuCategories(curatedMenu);
      setCollapsedCategories(new Set());

      const { data, error: fetchError } = await supabase
        .from('dish_associations')
        .select(
          'id, dish_id, dish_name, image_url, cuisine, tasty_score, filling_score, created_at'
        )
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      const list = (data as DishAssociation[]) ?? [];
      const map = new Map<string, DishSummary & { count: number }>();

      list.forEach((row) => {
        const name = row.dish_name ?? 'מנה';
        const key = row.dish_id !== null ? String(row.dish_id) : name;
        if (!map.has(key)) {
          map.set(key, {
            key,
            name,
            imageUrl: row.image_url ?? null,
            avgTasty: 0,
            avgFilling: 0,
            cuisine: row.cuisine ?? 'ללא מטבח',
            count: 0,
          });
        }
        const entry = map.get(key)!;
        if (!entry.imageUrl && row.image_url) {
          entry.imageUrl = row.image_url;
        }
        if (typeof row.tasty_score === 'number') entry.avgTasty += row.tasty_score;
        if (typeof row.filling_score === 'number') entry.avgFilling += row.filling_score;
        entry.count += 1;
      });

      const result: DishSummary[] = Array.from(map.values()).map((entry) => ({
        key: entry.key,
        name: entry.name,
        imageUrl: entry.imageUrl,
        avgTasty: entry.count ? entry.avgTasty / entry.count : 0,
        avgFilling: entry.count ? entry.avgFilling / entry.count : 0,
        cuisine: entry.cuisine,
      }));

      setSummaries(result);
    } catch (err) {
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
          <ActivityIndicator size="large" />
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
                  color="#9e211c"
                />
              </Pressable>
            ) : (
              <Pressable
                style={styles.dishCard}
                onPress={() =>
                  router.push({
                    pathname: '/camera/details',
                    params: {
                      restaurantId: restaurantId ? String(restaurantId) : '',
                      restaurantName,
                      dishId: item.dish.key,
                      dishName: item.dish.name,
                      defaultImageUrl: item.dish.imageUrl ?? '',
                    },
                  })
                }
              >
                <View style={styles.dishInfo}>
                  <Text style={styles.dishName}>{item.dish.name}</Text>
                  <View style={styles.scoreRow}>
                    <View style={styles.scoreItem}>
                      <View style={styles.ratingInlineRow}>
                        <Text style={styles.scoreLabel}>טעים</Text>
                        {renderStars(scoreToStars(item.dish.avgTasty))}
                      </View>
                    </View>
                    <View style={styles.scoreItem}>
                      <View style={styles.ratingInlineRow}>
                        <Text style={styles.scoreLabel}>משביע</Text>
                        {renderStars(scoreToStars(item.dish.avgFilling))}
                      </View>
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
  scoreRow: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  scoreItem: {
    alignItems: 'center',
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingRight: 30,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  starRowRtl: {
    flexDirection: 'row-reverse',
  },
  emojiIcon: {
    marginTop: 1,
  },
  scoreLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    minWidth: 44,
    textAlign: 'right',
    alignSelf: 'flex-end',
    lineHeight: 24,
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
