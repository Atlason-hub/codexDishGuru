import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { fetchCompanyIdForUser, fetchVisibleDishes } from '../lib/appData';

type DishAssociation = {
  id: string;
  dish_id: number | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  cuisine: string | null;
  image_url: string | null;
  tasty_score: number | null;
  filling_score: number | null;
  created_at: string | null;
};

type RestaurantApi = {
  RestaurantId: number;
  RestaurantName: string;
  RestaurantCuisineList?: string | null;
};

type ApiDishResult = {
  id: string;
  name: string;
  restaurantId: number;
  restaurantName: string;
};

type DishItem = {
  id: number;
  name: string;
};

type DishSearchItem = {
  id: string;
  name: string;
  dishId: number | null;
  restaurantId: number | null;
  restaurantName: string | null;
  isApi: boolean;
};

type DishCategory = {
  id: string;
  name: string;
  items: DishSearchItem[];
};

type DishDropdownRow =
  | { type: 'header'; id: string; name: string }
  | { type: 'item'; id: string; item: DishSearchItem };

type MenuCategory = {
  id: string;
  name: string;
  items: DishItem[];
};

type MenuDropdownRow =
  | { type: 'header'; id: string; name: string }
  | { type: 'item'; id: string; item: DishItem };

type RestaurantCategory = {
  id: string;
  name: string;
  items: RestaurantApi[];
};

type RestaurantDropdownRow =
  | { type: 'header'; id: string; name: string }
  | { type: 'item'; id: string; item: RestaurantApi };

type SearchMode = 'db' | 'api';

const normalizeCuisine = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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

const isSystemEntry = (value: string) => value.toLowerCase().includes('system');

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
    const safeName = categoryName ?? 'Uncategorized';
    if (isSystemEntry(safeName)) return;

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
      if (isSystemEntry(name)) return;
      bucket.items.push({ id, name });
    });
  });

  if (categoryMap.size === 0 && Array.isArray(data?.Data?.Dishes)) {
    const bucket = ensureCategory('uncategorized', 'Uncategorized');
    data.Data.Dishes.forEach((d: any) => {
      const name = normalizeDishName(d?.DishName) ?? normalizeDishName(d?.Name);
      const id =
        normalizeDishId(d?.DishId) ??
        normalizeDishId(d?.Id) ??
        normalizeDishId(d?.DishID);
      if (!name || id === null) return;
      if (isSystemEntry(name)) return;
      bucket.items.push({ id, name });
    });
  }

  return Array.from(categoryMap.values()).filter((cat) => cat.items.length > 0);
};

const mapRestaurantsToCategories = (restaurants: RestaurantApi[]): RestaurantCategory[] => {
  const categoryMap = new Map<string, RestaurantCategory>();
  const order: string[] = [];
  const getBucket = (key: string, name: string) => {
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { id: key, name, items: [] });
      order.push(key);
    }
    return categoryMap.get(key)!;
  };

  restaurants.forEach((restaurant) => {
    const cuisineRaw =
      typeof restaurant.RestaurantCuisineList === 'string'
        ? restaurant.RestaurantCuisineList.trim()
        : '';
    const cuisine = cuisineRaw.split(',')[0]?.trim();
    if (cuisine) {
      getBucket(`cuisine-${cuisine}`, cuisine).items.push(restaurant);
    } else {
      getBucket('all-restaurants', 'מסעדות').items.push(restaurant);
    }
  });

  return order.map((key) => categoryMap.get(key)!).filter((cat) => cat.items.length > 0);
};

const buildRestaurantRows = (
  categories: RestaurantCategory[],
  query: string,
  collapsed: Set<string>
): RestaurantDropdownRow[] => {
  const needle = query.trim().toLowerCase();
  const rows: RestaurantDropdownRow[] = [];
  categories.forEach((cat) => {
    const filtered = needle
      ? cat.items.filter((item) => item.RestaurantName.toLowerCase().includes(needle))
      : cat.items;
    if (filtered.length === 0) return;
    rows.push({ type: 'header', id: `header-${cat.id}`, name: cat.name });
    if (collapsed.has(cat.id)) return;
    filtered.forEach((item) =>
      rows.push({ type: 'item', id: `${cat.id}-${item.RestaurantId}`, item })
    );
  });
  return rows;
};

const buildDishCategories = (items: DishSearchItem[]): DishCategory[] => {
  const map = new Map<string, DishCategory>();
  items.forEach((item) => {
    const restaurantName = item.restaurantName?.trim() || 'מסעדה';
    const key = item.restaurantId ? `rest-${item.restaurantId}` : `rest-${restaurantName}`;
    if (!map.has(key)) {
      map.set(key, { id: key, name: restaurantName, items: [] });
    }
    map.get(key)!.items.push(item);
  });
  return Array.from(map.values()).filter((cat) => cat.items.length > 0);
};

const buildDishRows = (
  categories: DishCategory[],
  query: string,
  collapsed: Set<string>
): DishDropdownRow[] => {
  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;
  const rows: DishDropdownRow[] = [];
  categories.forEach((cat) => {
    const filtered = needle
      ? cat.items.filter((item) => item.name.toLowerCase().includes(needle))
      : cat.items;
    if (filtered.length === 0) return;
    rows.push({ type: 'header', id: `header-${cat.id}`, name: cat.name });
    if (!isSearching && collapsed.has(cat.id)) return;
    filtered.forEach((item) =>
      rows.push({ type: 'item', id: `${cat.id}-${item.id}`, item })
    );
  });
  return rows;
};

const buildMenuRows = (
  categories: MenuCategory[],
  query: string,
  collapsed: Set<string>
): MenuDropdownRow[] => {
  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;
  const rows: MenuDropdownRow[] = [];
  categories.forEach((cat) => {
    const filtered = needle
      ? cat.items.filter((item) => item.name.toLowerCase().includes(needle))
      : cat.items;
    if (filtered.length === 0) return;
    rows.push({ type: 'header', id: `header-${cat.id}`, name: cat.name });
    if (!isSearching && collapsed.has(cat.id)) return;
    filtered.forEach((item) =>
      rows.push({ type: 'item', id: `${cat.id}-${item.id}`, item })
    );
  });
  return rows;
};

export default function SearchScreen() {
  const router = useRouter();
  const [restaurantDropdownOpen, setRestaurantDropdownOpen] = useState(false);
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false);
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [dishQuery, setDishQuery] = useState('');
  const [debouncedRestaurant, setDebouncedRestaurant] = useState('');
  const [debouncedDish, setDebouncedDish] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DishAssociation[]>([]);
  const [apiResults, setApiResults] = useState<RestaurantApi[]>([]);
  const [apiDishResults, setApiDishResults] = useState<ApiDishResult[]>([]);
  const [mode, setMode] = useState<SearchMode>('api');
  const [companyCityId, setCompanyCityId] = useState<number | null>(null);
  const [companyStreetId, setCompanyStreetId] = useState<number | null>(null);
  const [restaurantResults, setRestaurantResults] = useState<RestaurantApi[]>([]);
  const [collapsedRestaurantCategories, setCollapsedRestaurantCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedDishCategories, setCollapsedDishCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedApiRestaurantId, setSelectedApiRestaurantId] = useState<number | null>(null);
  const [selectedApiRestaurantName, setSelectedApiRestaurantName] = useState<string | null>(null);
  const [apiMenuCategories, setApiMenuCategories] = useState<MenuCategory[]>([]);
  const [collapsedApiMenuCategories, setCollapsedApiMenuCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [apiMenuLoading, setApiMenuLoading] = useState(false);

  const trimmedRestaurant = debouncedRestaurant.trim();
  const trimmedDish = debouncedDish.trim();

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedRestaurant(restaurantQuery);
    }, 250);
    return () => clearTimeout(handle);
  }, [restaurantQuery]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedDish(dishQuery);
    }, 250);
    return () => clearTimeout(handle);
  }, [dishQuery]);

  const restaurantCategories = useMemo(
    () => mapRestaurantsToCategories(restaurantResults),
    [restaurantResults]
  );
  const restaurantRows = useMemo(
    () => buildRestaurantRows(restaurantCategories, trimmedRestaurant, collapsedRestaurantCategories),
    [restaurantCategories, trimmedRestaurant, collapsedRestaurantCategories]
  );

  const dishItems = useMemo<DishSearchItem[]>(() => {
    if (mode === 'db') {
      return results.map((row) => ({
        id: row.id,
        name: row.dish_name ?? 'מנה',
        dishId: row.dish_id,
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        isApi: false,
      }));
    }
    return apiDishResults.map((row) => ({
      id: row.id,
      name: row.name,
      dishId: null,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurantName,
      isApi: true,
    }));
  }, [apiDishResults, mode, results]);

  const dishCategories = useMemo(() => buildDishCategories(dishItems), [dishItems]);
  const dishRows = useMemo(
    () => buildDishRows(dishCategories, trimmedDish, collapsedDishCategories),
    [dishCategories, trimmedDish, collapsedDishCategories]
  );
  const apiMenuRows = useMemo(
    () => buildMenuRows(apiMenuCategories, trimmedDish, collapsedApiMenuCategories),
    [apiMenuCategories, trimmedDish, collapsedApiMenuCategories]
  );

  useEffect(() => {
    setCollapsedRestaurantCategories(new Set());
  }, [restaurantCategories]);

  useEffect(() => {
    setCollapsedDishCategories(new Set(dishCategories.map((cat) => cat.id)));
  }, [dishCategories]);

  useEffect(() => {
    setCollapsedApiMenuCategories(new Set(apiMenuCategories.map((cat) => cat.id)));
  }, [apiMenuCategories]);

  useEffect(() => {
    let mounted = true;
    const loadCompanyAddress = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from('AppUsers')
        .select('company_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      const companyId = profile?.company_id;
      if (!companyId) return;
      const { data: company } = await supabase
        .from('companies')
        .select('city_id, street_id')
        .eq('id', companyId)
        .maybeSingle();
      if (!mounted) return;
      setCompanyCityId(company?.city_id ?? null);
      setCompanyStreetId(company?.street_id ?? null);
    };
    loadCompanyAddress();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!trimmedRestaurant && !trimmedDish) {
      setResults([]);
      setApiResults([]);
      setApiDishResults([]);
      setRestaurantResults([]);
      setSelectedApiRestaurantId(null);
      setSelectedApiRestaurantName(null);
      setApiMenuCategories([]);
      setCollapsedApiMenuCategories(new Set());
      setError(null);
      return;
    }
    let mounted = true;
    const runDb = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id ?? null;
        let companyRows: DishAssociation[] = [];
        if (userId) {
          const companyId = await fetchCompanyIdForUser(userId);
          if (companyId) {
            companyRows = (await fetchVisibleDishes(companyId)) as DishAssociation[];
          }
        }

        const restaurantNeedle = trimmedRestaurant.toLowerCase();
        const dishNeedle = trimmedDish.toLowerCase();

        const filteredRestaurants = trimmedRestaurant
          ? companyRows.filter((row) =>
              (row.restaurant_name ?? '').toLowerCase().includes(restaurantNeedle)
            )
          : companyRows;

        if (trimmedRestaurant) {
          const unique = new Map<string, RestaurantApi>();
          filteredRestaurants.forEach((row: any) => {
            const id = row?.restaurant_id;
            const name = row?.restaurant_name;
            if (!id || !name) return;
            if (!unique.has(String(id))) {
              unique.set(String(id), {
                RestaurantId: id,
                RestaurantName: name,
                RestaurantCuisineList: normalizeCuisine(row?.cuisine) ?? null,
              });
            }
          });
          if (mounted) setRestaurantResults(Array.from(unique.values()));
        } else {
          if (mounted) setRestaurantResults([]);
        }

        const filteredDishes = trimmedDish
          ? companyRows.filter((row) =>
              (row.dish_name ?? '').toLowerCase().includes(dishNeedle)
            )
          : companyRows;
        const scopedDishes = trimmedRestaurant
          ? filteredDishes.filter((row) =>
              (row.restaurant_name ?? '').toLowerCase().includes(restaurantNeedle)
            )
          : filteredDishes;
        if (mounted) {
          if (!trimmedDish && !trimmedRestaurant) {
            setResults([]);
          } else {
            setResults(
              scopedDishes.sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return bTime - aTime;
              })
            );
          }
        }
      } catch {
        if (mounted) setError('אירעה שגיאה. נסה שוב.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const runApi = async () => {
      try {
        setLoading(true);
        setError(null);
        const useCity = companyCityId ?? 14;
        const useStreet = companyStreetId ?? 54730;
        const response = await fetch(
          `https://www.10bis.co.il/api/SearchResListWithOrderHistoryAndPopularDishesAndRes?cityId=${useCity}&streetId=${useStreet}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const text = await response.text();
        const data = JSON.parse(text);
        const list: RestaurantApi[] = Array.isArray(data?.Data?.ResList)
          ? data.Data.ResList.map((item: any) => ({
              RestaurantId: item?.RestaurantId,
              RestaurantName: item?.RestaurantName,
              RestaurantCuisineList:
                typeof item?.RestaurantCuisineList === 'string'
                  ? item.RestaurantCuisineList
                  : null,
            }))
          : [];
        const restaurantNeedle = trimmedRestaurant.toLowerCase();
        const filteredRestaurants = trimmedRestaurant
          ? list.filter((item) => {
              const name = item.RestaurantName?.toLowerCase() ?? '';
              return name.includes(restaurantNeedle);
            })
          : list;

        if (trimmedRestaurant) {
          if (mounted) setRestaurantResults(filteredRestaurants);
        } else {
          if (mounted) setRestaurantResults([]);
        }

        if (mounted) {
          setApiDishResults([]);
          setApiResults(filteredRestaurants);
        }
      } catch {
        if (mounted) setError('אירעה שגיאה. נסה שוב.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (mode === 'db') {
      runDb();
    } else {
      runApi();
    }

    return () => {
      mounted = false;
    };
  }, [trimmedRestaurant, trimmedDish, mode, companyCityId, companyStreetId]);

  useEffect(() => {
    if (mode !== 'api') {
      setSelectedApiRestaurantId(null);
      setSelectedApiRestaurantName(null);
      setApiMenuCategories([]);
      setCollapsedApiMenuCategories(new Set());
      return;
    }
    if (!selectedApiRestaurantId) {
      setApiMenuCategories([]);
      setCollapsedApiMenuCategories(new Set());
      return;
    }
    const fetchMenu = async () => {
      try {
        setApiMenuLoading(true);
        const response = await fetch(
          `https://www.10bis.co.il/api/GetMenu?ResId=${selectedApiRestaurantId}&websiteID=10bis&domainID=10bis`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const text = await response.text();
        const data = JSON.parse(text);
        const categories = mapMenuToCategories(data);
        setApiMenuCategories(categories);
        setCollapsedApiMenuCategories(new Set());
      } catch {
        setApiMenuCategories([]);
      } finally {
        setApiMenuLoading(false);
      }
    };
    fetchMenu();
  }, [mode, selectedApiRestaurantId]);

  const headerText = useMemo(() => {
    if (!trimmedRestaurant && !trimmedDish) return '';
    const parts = [];
    if (trimmedRestaurant) parts.push(`מסעדות: "${trimmedRestaurant}"`);
    if (trimmedDish) parts.push(`מנות: "${trimmedDish}"`);
    return `תוצאות עבור ${parts.join(' | ')}`;
  }, [trimmedRestaurant, trimmedDish]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.backButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>חיפוש</Text>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === 'api' && styles.modeButtonActive]}
          onPress={() => setMode('api')}
        >
          <Text style={[styles.modeText, mode === 'api' && styles.modeTextActive]}>
            כלל המנות
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'db' && styles.modeButtonActive]}
          onPress={() => setMode('db')}
        >
          <Text style={[styles.modeText, mode === 'db' && styles.modeTextActive]}>
            מנות שהועלו
          </Text>
        </Pressable>
      </View>

      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownHeader}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setRestaurantDropdownOpen((prev) => !prev);
          }}
        >
          <Text
            style={[
              styles.dropdownText,
              !restaurantQuery.trim() && !selectedApiRestaurantName && styles.dropdownPlaceholder,
            ]}
          >
            {mode === 'api'
              ? ((selectedApiRestaurantName ?? restaurantQuery.trim()) || 'בחר מסעדה')
              : restaurantQuery.trim() || 'בחר מסעדה'}
          </Text>
          <View style={styles.chevronCircle}>
            <Ionicons
              name={restaurantDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="theme.colors.accent"
            />
          </View>
        </Pressable>
        {restaurantDropdownOpen ? (
          <View style={styles.dropdownList}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="חיפוש מסעדה…"
                placeholderTextColor={theme.colors.textMuted}
                value={restaurantQuery}
                onChangeText={(text) => {
                  setRestaurantQuery(text);
                  if (mode === 'api') {
                    setSelectedApiRestaurantId(null);
                    setSelectedApiRestaurantName(null);
                    setDishQuery('');
                  }
                }}
                textAlign="right"
              />
              {restaurantQuery.trim().length > 0 ? (
                <Pressable
                  style={styles.inlineClearButton}
                  onPress={() => {
                    setRestaurantQuery('');
                    setDebouncedRestaurant('');
                    setSelectedApiRestaurantId(null);
                    setSelectedApiRestaurantName(null);
                    setDishQuery('');
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {restaurantRows.length > 0 ? (
              <FlatList
                data={restaurantRows}
                keyExtractor={(item) => item.id}
                initialNumToRender={16}
                maxToRenderPerBatch={16}
                updateCellsBatchingPeriod={50}
                windowSize={6}
                removeClippedSubviews
                renderItem={({ item }) =>
                  item.type === 'header' ? (
                    <Pressable
                      style={styles.categoryHeader}
                      onPress={() =>
                        setCollapsedRestaurantCategories((prev) => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                      <Text style={styles.categoryHeaderText}>{item.name}</Text>
                      <View style={styles.categoryChevronCircle}>
                        <Ionicons
                          name={
                            collapsedRestaurantCategories.has(item.id.replace('header-', ''))
                              ? 'chevron-down'
                              : 'chevron-up'
                          }
                          size={14}
                          color={theme.colors.textMuted}
                        />
                      </View>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => {
                        if (mode === 'api') {
                          setSelectedApiRestaurantId(item.item.RestaurantId);
                          setSelectedApiRestaurantName(item.item.RestaurantName ?? '');
                          setRestaurantQuery(item.item.RestaurantName ?? '');
                          setDishQuery('');
                          setRestaurantDropdownOpen(false);
                          setDishDropdownOpen(true);
                          return;
                        }
                        setRestaurantDropdownOpen(false);
                        router.push({
                          pathname: '/restaurant',
                          params: {
                            restaurantId: String(item.item.RestaurantId ?? ''),
                            restaurantName: item.item.RestaurantName ?? '',
                          },
                        });
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{item.item.RestaurantName}</Text>
                    </Pressable>
                  )
                }
              />
            ) : loading && trimmedRestaurant.length > 0 ? (
              <View style={styles.dropdownLoadingRow}>
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
                <Text style={styles.dropdownLoadingText}>מחפש מסעדות…</Text>
              </View>
            ) : (
              <Text style={styles.dropdownEmpty}>לא נמצאו מסעדות</Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.dropdownContainer}>
        <Pressable
          style={styles.dropdownHeader}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setDishDropdownOpen((prev) => !prev);
          }}
          disabled={mode === 'api' && !selectedApiRestaurantId}
        >
          <Text
            style={[
              styles.dropdownText,
              !dishQuery.trim() && styles.dropdownPlaceholder,
            ]}
          >
            {dishQuery.trim() ||
              (mode === 'api'
                ? !selectedApiRestaurantId
                  ? 'בחר מסעדה קודם'
                  : 'הכנס שם או בחר מנה'
                : 'הכנס שם או בחר מנה')}
          </Text>
          <View style={styles.chevronCircle}>
            <Ionicons
              name={dishDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="theme.colors.accent"
            />
          </View>
        </Pressable>
        {dishDropdownOpen ? (
          <View style={styles.dropdownList}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={
                  mode === 'api' ? 'חיפוש מנה…' : 'חיפוש מנה…'
                }
                placeholderTextColor={theme.colors.textMuted}
                value={dishQuery}
                onChangeText={setDishQuery}
                editable={mode !== 'api' || Boolean(selectedApiRestaurantId)}
                textAlign="right"
              />
              {dishQuery.trim().length > 0 ? (
                <Pressable
                  style={styles.inlineClearButton}
                  onPress={() => {
                    setDishQuery('');
                    setDebouncedDish('');
                  }}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={16} color={theme.colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {mode === 'api' && apiMenuLoading ? (
              <View style={styles.dropdownLoadingRow}>
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
                <Text style={styles.dropdownLoadingText}>טוען מנות…</Text>
              </View>
            ) : mode === 'api' && apiMenuRows.length > 0 ? (
              <>
                <View style={styles.dropdownControlsRow}>
                  <Pressable
                    style={styles.dropdownControlButton}
                    onPress={() => setCollapsedApiMenuCategories(new Set())}
                  >
                    <Text style={styles.dropdownControlText}>הרחב הכל</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dropdownControlButton}
                    onPress={() =>
                      setCollapsedApiMenuCategories(new Set(apiMenuCategories.map((cat) => cat.id)))
                    }
                  >
                    <Text style={styles.dropdownControlText}>כווץ הכל</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={apiMenuRows}
                  keyExtractor={(item) => item.id}
                  initialNumToRender={16}
                  maxToRenderPerBatch={16}
                  updateCellsBatchingPeriod={50}
                  windowSize={6}
                  removeClippedSubviews
                  renderItem={({ item }) =>
                    item.type === 'header' ? (
                      <Pressable
                        style={styles.categoryHeader}
                        onPress={() =>
                          setCollapsedApiMenuCategories((prev) => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                        <Text style={styles.categoryHeaderText}>{item.name}</Text>
                        <View style={styles.categoryChevronCircle}>
                          <Ionicons
                            name={
                              collapsedApiMenuCategories.has(item.id.replace('header-', ''))
                                ? 'chevron-down'
                                : 'chevron-up'
                            }
                            size={14}
                            color={theme.colors.textMuted}
                          />
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.dropdownItem}
                        onPress={() => {
                          router.push({
                            pathname: '/camera/details',
                            params: {
                              restaurantId: String(selectedApiRestaurantId ?? ''),
                              restaurantName: selectedApiRestaurantName ?? '',
                              dishName: item.item.name,
                            },
                          });
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{item.item.name}</Text>
                      </Pressable>
                    )
                  }
                />
              </>
            ) : mode === 'db' && dishRows.length > 0 ? (
              <>
                <View style={styles.dropdownControlsRow}>
                  <Pressable
                    style={styles.dropdownControlButton}
                    onPress={() => setCollapsedDishCategories(new Set())}
                  >
                    <Text style={styles.dropdownControlText}>הרחב הכל</Text>
                  </Pressable>
                  <Pressable
                    style={styles.dropdownControlButton}
                    onPress={() =>
                      setCollapsedDishCategories(new Set(dishCategories.map((cat) => cat.id)))
                    }
                  >
                    <Text style={styles.dropdownControlText}>כווץ הכל</Text>
                  </Pressable>
                </View>
                <FlatList
                  data={dishRows}
                  keyExtractor={(item) => item.id}
                  initialNumToRender={16}
                  maxToRenderPerBatch={16}
                  updateCellsBatchingPeriod={50}
                  windowSize={6}
                  removeClippedSubviews
                  renderItem={({ item }) =>
                    item.type === 'header' ? (
                      <Pressable
                        style={styles.categoryHeader}
                        onPress={() =>
                          setCollapsedDishCategories((prev) => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                        <Text style={styles.categoryHeaderText}>{item.name}</Text>
                        <View style={styles.categoryChevronCircle}>
                          <Ionicons
                            name={
                              collapsedDishCategories.has(item.id.replace('header-', ''))
                                ? 'chevron-down'
                                : 'chevron-up'
                            }
                            size={14}
                            color={theme.colors.textMuted}
                          />
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.dropdownItem}
                        onPress={() => {
                          router.push({
                            pathname: '/dish',
                            params: {
                              dishId: item.item.dishId ? String(item.item.dishId) : '',
                              dishName: item.item.name,
                            },
                          });
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{item.item.name}</Text>
                      </Pressable>
                    )
                  }
                />
              </>
            ) : mode === 'db' && loading && trimmedDish.length > 0 ? (
              <View style={styles.dropdownLoadingRow}>
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
                <Text style={styles.dropdownLoadingText}>מחפש מנות…</Text>
              </View>
            ) : (
              <Text style={styles.dropdownEmpty}>
                {mode === 'api' ? 'לא נמצאו מנות' : 'לא נמצאו מנות'}
              </Text>
            )}
          </View>
        ) : null}
      </View>

      {headerText ? <Text style={styles.resultsHeader}>{headerText}</Text> : null}

      {loading ? (
        <View style={styles.resultsBox}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.resultsBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : mode === 'db' &&
        results.length === 0 &&
        restaurantResults.length === 0 &&
        (trimmedRestaurant || trimmedDish) ? (
        <View style={styles.resultsBox}>
          <Text style={styles.placeholderText}>
            לא נמצאו תוצאות
          </Text>
        </View>
      ) : mode === 'api' &&
        apiResults.length === 0 &&
        apiDishResults.length === 0 &&
        restaurantResults.length === 0 &&
        (trimmedRestaurant || trimmedDish) ? (
        <View style={styles.resultsBox}>
          <Text style={styles.placeholderText}>
            לא נמצאו מסעדות
          </Text>
        </View>
      ) : null}

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
  dropdownContainer: {
    width: '100%',
    marginTop: 10,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  dropdownText: {
    fontSize: 18,
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  dropdownPlaceholder: {
    color: theme.colors.textMuted,
  },
  chevronCircle: {
    height: 28,
    width: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
  },
  inlineClearButton: {
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  modeRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 6,
    marginBottom: 16,
  },
  modeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
  },
  modeButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  modeText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  modeTextActive: {
    color: theme.colors.accent,
  },
  resultsHeader: {
    marginTop: 10,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    maxHeight: 240,
    backgroundColor: theme.colors.card,
    marginTop: 10,
  },
  dropdownControlsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: theme.colors.card,
  },
  dropdownControlButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
  },
  dropdownControlText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
  },
  categoryHeader: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.cardAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  categoryChevronCircle: {
    height: 22,
    width: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  dropdownLoadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  dropdownLoadingText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  dropdownEmpty: {
    padding: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  sectionHeader: {
    marginTop: 12,
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '700',
    textAlign: 'right',
  },
  resultsBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: theme.colors.cardAlt,
    marginTop: 12,
  },
  listContent: {
    paddingBottom: 120,
    gap: 12,
    marginTop: 12,
  },
  resultCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
  },
  resultInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dishName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
  },
  restaurantName: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  cuisineText: {
    marginTop: 4,
    fontSize: 11,
    color: theme.colors.accent,
    textAlign: 'right',
  },
  resultImageWrap: {
    width: 72,
    height: 54,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
  },
  resultImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  resultPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
  },
  placeholderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 3,
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
