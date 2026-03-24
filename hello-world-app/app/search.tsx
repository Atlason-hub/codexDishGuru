import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import CachedLogo from '../components/CachedLogo';

type DishAssociation = {
  id: string;
  dish_id: number | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  cuisine: string | null;
  image_url: string | null;
  tasty_score: number | null;
  fast_score: number | null;
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

type SearchMode = 'db' | 'api';

const normalizeCuisine = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const extractMenuDishes = (data: any): string[] => {
  const categories: any[] = Array.isArray(data?.Data)
    ? data.Data
    : Array.isArray(data?.Data?.Categories)
    ? data.Data.Categories
    : [];
  const names: string[] = [];
  categories.forEach((cat) => {
    const dishesArr = Array.isArray(cat?.DishList)
      ? cat.DishList
      : Array.isArray(cat?.Dishes)
      ? cat.Dishes
      : [];
    dishesArr.forEach((d: any) => {
      const name =
        typeof d?.DishName === 'string'
          ? d.DishName
          : typeof d?.Name === 'string'
          ? d.Name
          : null;
      if (name) names.push(name);
    });
  });
  if (names.length === 0 && Array.isArray(data?.Data?.Dishes)) {
    data.Data.Dishes.forEach((d: any) => {
      const name =
        typeof d?.DishName === 'string'
          ? d.DishName
          : typeof d?.Name === 'string'
          ? d.Name
          : null;
      if (name) names.push(name);
    });
  }
  return names;
};

export default function SearchScreen() {
  const router = useRouter();
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [dishQuery, setDishQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DishAssociation[]>([]);
  const [apiResults, setApiResults] = useState<RestaurantApi[]>([]);
  const [apiDishResults, setApiDishResults] = useState<ApiDishResult[]>([]);
  const [mode, setMode] = useState<SearchMode>('db');
  const [companyCityId, setCompanyCityId] = useState<number | null>(null);
  const [companyStreetId, setCompanyStreetId] = useState<number | null>(null);
  const [restaurantResults, setRestaurantResults] = useState<RestaurantApi[]>([]);

  const trimmedRestaurant = restaurantQuery.trim();
  const trimmedDish = dishQuery.trim();

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
      setError(null);
      return;
    }
    let mounted = true;
    const runDb = async () => {
      try {
        setLoading(true);
        setError(null);
        if (trimmedRestaurant) {
          const { data: restaurantData, error: restaurantError } = await supabase
            .from('dish_associations')
            .select('restaurant_id, restaurant_name, cuisine')
            .ilike('restaurant_name', `%${trimmedRestaurant}%`)
            .order('restaurant_name', { ascending: true })
            .limit(100);
          if (restaurantError) throw restaurantError;
          const unique = new Map<string, RestaurantApi>();
          (restaurantData ?? []).forEach((row: any) => {
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

        if (trimmedDish) {
          let query = supabase
            .from('dish_associations')
            .select(
              'id, dish_id, dish_name, restaurant_name, restaurant_id, cuisine, image_url, tasty_score, fast_score, filling_score, created_at'
            )
            .ilike('dish_name', `%${trimmedDish}%`)
            .order('created_at', { ascending: false })
            .limit(100);
          if (trimmedRestaurant) {
            query = query.ilike('restaurant_name', `%${trimmedRestaurant}%`);
          }
          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          if (mounted) setResults((data as DishAssociation[]) ?? []);
        } else {
          if (mounted) setResults([]);
        }
      } catch (err) {
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
        const dishNeedle = trimmedDish.toLowerCase();
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

        if (trimmedDish) {
          const MAX_MENU_CHECKS = 15;
          const candidates = filteredRestaurants.slice(0, MAX_MENU_CHECKS);
          const dishMatches: ApiDishResult[] = [];
          for (const restaurant of candidates) {
            try {
              const menuResponse = await fetch(
                `https://www.10bis.co.il/api/GetMenu?ResId=${restaurant.RestaurantId}&websiteID=10bis&domainID=10bis`,
                { headers: { Accept: 'application/json' } }
              );
              if (!menuResponse.ok) continue;
              const menuText = await menuResponse.text();
              const menuData = JSON.parse(menuText);
              const dishNames = extractMenuDishes(menuData);
              dishNames.forEach((name) => {
                if (name.toLowerCase().includes(dishNeedle)) {
                  dishMatches.push({
                    id: `${restaurant.RestaurantId}-${name}`,
                    name,
                    restaurantId: restaurant.RestaurantId,
                    restaurantName: restaurant.RestaurantName ?? '',
                  });
                }
              });
            } catch {
              // ignore menu errors
            }
          }
          const unique = new Map<string, ApiDishResult>();
          dishMatches.forEach((item) => {
            const key = `${item.restaurantId}-${item.name}`;
            if (!unique.has(key)) unique.set(key, item);
          });
          if (mounted) setApiDishResults(Array.from(unique.values()));
          if (mounted) setApiResults([]);
        } else {
          if (mounted) setApiDishResults([]);
          if (mounted) setApiResults(filteredRestaurants);
        }
      } catch (err) {
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>חיפוש</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="restaurant-outline" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש מסעדות"
          placeholderTextColor="#94A3B8"
          value={restaurantQuery}
          onChangeText={setRestaurantQuery}
          textAlign="right"
        />
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="fast-food-outline" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="חיפוש מנות"
          placeholderTextColor="#94A3B8"
          value={dishQuery}
          onChangeText={setDishQuery}
          textAlign="right"
        />
      </View>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === 'db' && styles.modeButtonActive]}
          onPress={() => setMode('db')}
        >
          <Text style={[styles.modeText, mode === 'db' && styles.modeTextActive]}>
            מנות שהועלו
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'api' && styles.modeButtonActive]}
          onPress={() => setMode('api')}
        >
          <Text style={[styles.modeText, mode === 'api' && styles.modeTextActive]}>
            כלל המנות
          </Text>
        </Pressable>
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
      ) : mode === 'db' && results.length === 0 && restaurantResults.length === 0 ? (
        <View style={styles.resultsBox}>
          <Text style={styles.placeholderText}>
            {trimmedRestaurant || trimmedDish ? 'לא נמצאו תוצאות' : 'הקלד כדי לחפש'}
          </Text>
        </View>
      ) : mode === 'api' &&
        apiResults.length === 0 &&
        apiDishResults.length === 0 &&
        restaurantResults.length === 0 ? (
        <View style={styles.resultsBox}>
          <Text style={styles.placeholderText}>
            {trimmedRestaurant || trimmedDish ? 'לא נמצאו מסעדות' : 'הקלד כדי לחפש'}
          </Text>
        </View>
      ) : (
        <>
          {restaurantResults.length > 0 && trimmedDish === '' ? (
            <>
              <Text style={styles.sectionHeader}>מסעדות</Text>
              <FlatList
                data={restaurantResults}
                keyExtractor={(item) => String(item.RestaurantId)}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.resultCard}
                    onPress={() => {
                      setRestaurantQuery(item.RestaurantName ?? '');
                      router.push({
                        pathname: '/restaurant',
                        params: {
                          restaurantId: String(item.RestaurantId),
                          restaurantName: item.RestaurantName ?? '',
                        },
                      });
                    }}
                  >
                    <View style={styles.resultInfo}>
                      <Text style={styles.dishName}>{item.RestaurantName ?? 'מסעדה'}</Text>
                      {item.RestaurantCuisineList ? (
                        <Text style={styles.cuisineText}>
                          {normalizeCuisine(item.RestaurantCuisineList)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.resultImageWrap}>
                      <View style={styles.resultPlaceholder}>
                        <Ionicons name="restaurant-outline" size={18} color="#CBD5E1" />
                      </View>
                    </View>
                  </Pressable>
                )}
              />
            </>
          ) : null}

          {results.length > 0 ? (
            <>
              <Text style={styles.sectionHeader}>מנות</Text>
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.resultCard}>
                    <View style={styles.resultInfo}>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/camera/details',
                            params: {
                              dishId: item.dish_id ? String(item.dish_id) : '',
                              dishName: item.dish_name ?? '',
                              restaurantId: item.restaurant_id
                                ? String(item.restaurant_id)
                                : '',
                              restaurantName: item.restaurant_name ?? '',
                              defaultImageUrl: item.image_url ?? '',
                            },
                          })
                        }
                      >
                        <Text style={styles.dishName}>{item.dish_name ?? 'מנה'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/restaurant',
                            params: {
                              restaurantId: item.restaurant_id
                                ? String(item.restaurant_id)
                                : '',
                              restaurantName: item.restaurant_name ?? '',
                            },
                          })
                        }
                      >
                        <Text style={styles.restaurantName}>
                          {item.restaurant_name ??
                            (item.restaurant_id ? `מסעדה ${item.restaurant_id}` : 'מסעדה')}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.resultImageWrap}>
                      {item.image_url ? (
                        <CachedLogo uri={item.image_url} style={styles.resultImage} />
                      ) : (
                        <View style={styles.resultPlaceholder}>
                          <Ionicons name="image-outline" size={18} color="#CBD5E1" />
                          <View style={styles.placeholderOverlay}>
                            <Ionicons name="camera" size={10} color="#ffffff" />
                            <Text style={styles.placeholderOverlayText}>צלם מנה</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              />
            </>
          ) : null}

          {mode === 'api' && apiDishResults.length > 0 ? (
            <>
              <Text style={styles.sectionHeader}>מנות</Text>
              <FlatList
                data={apiDishResults}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.resultCard}
                    onPress={() =>
                      router.push({
                        pathname: '/camera/details',
                        params: {
                          restaurantId: String(item.restaurantId),
                          restaurantName: item.restaurantName ?? '',
                          dishName: item.name,
                        },
                      })
                    }
                  >
                    <View style={styles.resultInfo}>
                      <Text style={styles.dishName}>{item.name}</Text>
                      <Text style={styles.restaurantName}>
                        {item.restaurantName || `מסעדה ${item.restaurantId}`}
                      </Text>
                    </View>
                    <View style={styles.resultImageWrap}>
                      <View style={styles.resultPlaceholder}>
                        <Ionicons name="fast-food-outline" size={18} color="#CBD5E1" />
                        <View style={styles.placeholderOverlay}>
                          <Ionicons name="camera" size={10} color="#ffffff" />
                          <Text style={styles.placeholderOverlayText}>צלם מנה</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                )}
              />
            </>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111111',
  },
  modeRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 10,
  },
  modeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modeButtonActive: {
    borderColor: '#F87171',
    backgroundColor: '#FEE2E2',
  },
  modeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#991B1B',
  },
  resultsHeader: {
    marginTop: 10,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
  },
  sectionHeader: {
    marginTop: 12,
    fontSize: 12,
    color: '#F87171',
    fontWeight: '700',
    textAlign: 'right',
  },
  resultsBox: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
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
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  resultInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  dishName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'right',
  },
  restaurantName: {
    marginTop: 4,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  cuisineText: {
    marginTop: 4,
    fontSize: 11,
    color: '#F87171',
    textAlign: 'right',
  },
  resultImageWrap: {
    width: 72,
    height: 54,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
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
    backgroundColor: '#F1F5F9',
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
    color: '#666666',
    fontSize: 14,
    textAlign: 'right',
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
    textAlign: 'right',
  },
});
