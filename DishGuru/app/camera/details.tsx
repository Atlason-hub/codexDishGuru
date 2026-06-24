import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { starsToScore } from '../../lib/ratings';
import EmojiRatingInput from '../../components/EmojiRatingInput';
import { showAppAlert } from '../../lib/appDialog';
import { useLocale } from '../../lib/locale';
import { fetchCompanyIdForUser } from '../../lib/appData';
import { getImageContentType, loadImageBytesFromUri } from '../../lib/localImage';
import {
  useEnableAndroidLayoutAnimation,
  useKeyboardInset,
} from '../../lib/uiHooks';

type Restaurant = {
  RestaurantId: number;
  RestaurantName: string;
  RestaurantCuisineList?: string | null;
};

type DishItem = {
  id: number;
  name: string;
};

type DishCategory = {
  id: string;
  name: string;
  items: DishItem[];
};

type DishDropdownRow =
  | { type: 'header'; id: string; name: string }
  | { type: 'item'; id: string; item: DishItem };

type RestaurantCategory = {
  id: string;
  name: string;
  items: Restaurant[];
};

type RestaurantDropdownRow =
  | { type: 'header'; id: string; name: string }
  | { type: 'item'; id: string; item: Restaurant };

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
const DEFAULT_CITY_ID = 14;
const DEFAULT_STREET_ID = 54730;
const SEARCH_FIELD_TOP_GUTTER = 24;

const mapMenuToCategories = (data: any): DishCategory[] => {
  const categories: any[] = Array.isArray(data?.Data)
    ? data.Data
    : Array.isArray(data?.Data?.Categories)
    ? data.Data.Categories
    : [];

  const categoryMap = new Map<string, DishCategory>();
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
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
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
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
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

const buildDropdownRows = (
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

const mapRestaurantsToCategories = (
  restaurants: Restaurant[],
  fallbackCategoryName: string
): RestaurantCategory[] => {
  const categoryMap = new Map<string, RestaurantCategory>();
  const getBucket = (key: string, name: string) => {
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { id: key, name, items: [] });
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
      getBucket('all-restaurants', fallbackCategoryName).items.push(restaurant);
    }
  });

  return Array.from(categoryMap.values())
    .map((cat) => ({
      ...cat,
      items: [...cat.items].sort((a, b) =>
        a.RestaurantName.localeCompare(b.RestaurantName)
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((cat) => cat.items.length > 0);
};

const getPrimaryCuisine = (cuisineList?: string | null) => {
  if (!cuisineList) return null;
  const first = cuisineList.split(',')[0]?.trim();
  return first ? first : null;
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
      ? cat.items.filter((item) =>
          item.RestaurantName.toLowerCase().includes(needle)
        )
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

export default function CameraDetailsScreen() {
  const router = useRouter();
  const { isRTL, t } = useLocale();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView | null>(null);
  const reviewInputYRef = useRef(0);
  const restaurantDropdownYRef = useRef(0);
  const dishDropdownYRef = useRef(0);
  const restaurantsRequestIdRef = useRef(0);
  const menuRequestIdRef = useRef(0);
  const hasNudgedRestaurantSearchRef = useRef(false);
  const hasNudgedDishSearchRef = useRef(false);
  const restaurantCollapsedBeforeSearchRef = useRef<Set<string> | null>(null);
  const dishCollapsedBeforeSearchRef = useRef<Set<string> | null>(null);
  const restaurantSearchFocusedRef = useRef(false);
  const dishSearchFocusedRef = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const draftSubmissionKeyRef = useRef(
    `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const photoUri = typeof params.photoUri === 'string' ? decodeURIComponent(params.photoUri) : null;
  const photoBase64 = typeof params.photoBase64 === 'string' ? params.photoBase64 : '';
  const presetRestaurantId =
    typeof params.restaurantId === 'string' && params.restaurantId
      ? Number(params.restaurantId)
      : null;
  const presetRestaurantName =
    typeof params.restaurantName === 'string' && params.restaurantName ? params.restaurantName : null;
  const presetDishId =
    typeof params.dishId === 'string' && params.dishId ? Number(params.dishId) : null;
  const presetDishName =
    typeof params.dishName === 'string' && params.dishName ? params.dishName : null;
  const defaultImageUrl =
    typeof params.defaultImageUrl === 'string' && params.defaultImageUrl
      ? params.defaultImageUrl
      : null;
  const lockSelection = params.lockSelection === '1';

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantCategories, setRestaurantCategories] = useState<RestaurantCategory[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [selectedRestaurantCuisine, setSelectedRestaurantCuisine] = useState<string | null>(null);
  const [dishCategories, setDishCategories] = useState<DishCategory[]>([]);
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false);
  const [dishSearch, setDishSearch] = useState('');
  const [selectedDish, setSelectedDish] = useState<DishItem | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [collapsedDishCategories, setCollapsedDishCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedRestaurantCategories, setCollapsedRestaurantCategories] = useState<Set<string>>(
    () => new Set()
  );
  const [tastyScore, setTastyScore] = useState(2.5);
  const [fillingScore, setFillingScore] = useState(2.5);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState(false);
  const allRestaurantCategoriesCollapsed =
    restaurantCategories.length > 0 &&
    restaurantCategories.every((cat) => collapsedRestaurantCategories.has(cat.id));
  const allDishCategoriesCollapsed =
    dishCategories.length > 0 &&
    dishCategories.every((cat) => collapsedDishCategories.has(cat.id));

  useEnableAndroidLayoutAnimation();

  useEffect(() => {
    draftSubmissionKeyRef.current = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }, [photoUri, photoBase64, selectedRestaurantId, selectedDish?.id]);

  useEffect(() => {
    let mounted = true;
    const syncAuthState = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setCurrentUserId(data.session?.user?.id ?? null);
    };
    syncAuthState();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const keyboardInset = useKeyboardInset({
    onShow: () => {
      keyboardVisibleRef.current = true;
      setTimeout(() => {
        if (restaurantSearchFocusedRef.current) {
          const targetY = Math.max(0, restaurantDropdownYRef.current - SEARCH_FIELD_TOP_GUTTER);
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
          return;
        }
        if (dishSearchFocusedRef.current) {
          const targetY = Math.max(0, dishDropdownYRef.current - SEARCH_FIELD_TOP_GUTTER);
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
        }
      }, 80);
    },
    onHide: () => {
      keyboardVisibleRef.current = false;
      restaurantSearchFocusedRef.current = false;
      dishSearchFocusedRef.current = false;
      hasNudgedRestaurantSearchRef.current = false;
      hasNudgedDishSearchRef.current = false;
    },
  });

  useEffect(() => {
    if (!selectedRestaurantId) return;
    const requestId = ++menuRequestIdRef.current;
    const fetchMenu = async () => {
      try {
        setMenuLoading(true);
        if (!presetDishId) setSelectedDish(null);
        setDishCategories([]);
        const response = await fetch(
          `https://www.10bis.co.il/api/GetMenu?ResId=${selectedRestaurantId}&websiteID=10bis&domainID=10bis`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const text = await response.text();
        const data = JSON.parse(text);
        const curated = mapMenuToCategories(data);
        if (menuRequestIdRef.current !== requestId) return;
        setDishCategories(curated);
        setCollapsedDishCategories(new Set(curated.map((cat) => cat.id)));
      } catch {
      } finally {
        if (menuRequestIdRef.current === requestId) {
          setMenuLoading(false);
        }
      }
    };
    fetchMenu();
  }, [presetDishId, selectedRestaurantId]);

  useEffect(() => {
    if (lockSelection) {
      setDropdownOpen(false);
      setDishDropdownOpen(false);
    }
  }, [lockSelection]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setSelectedRestaurantCuisine(null);
      return;
    }
    const match = restaurants.find((item) => item.RestaurantId === selectedRestaurantId);
    setSelectedRestaurantCuisine(getPrimaryCuisine(match?.RestaurantCuisineList));
  }, [selectedRestaurantId, restaurants]);

  useEffect(() => {
    if (!presetDishName && !presetDishId) return;
    const allDishes = dishCategories.flatMap((cat) => cat.items);
    let match: DishItem | undefined;
    if (presetDishId) {
      match = allDishes.find((item) => item.id === presetDishId);
    }
    if (!match && presetDishName) {
      const needle = presetDishName.toLowerCase().trim();
      match = allDishes.find((item) => item.name.toLowerCase().trim() === needle);
    }
    if (!match && presetDishName) {
      // fallback: allow prefill even if menu hasn't loaded yet
      match = { id: presetDishId ?? -1, name: presetDishName };
    }
    if (match) setSelectedDish(match);
  }, [presetDishId, presetDishName, dishCategories]);

  useEffect(() => {
    const needle = search.trim();
    if (!needle) {
      if (restaurantCollapsedBeforeSearchRef.current) {
        setCollapsedRestaurantCategories(restaurantCollapsedBeforeSearchRef.current);
        restaurantCollapsedBeforeSearchRef.current = null;
      }
      return;
    }
    if (!restaurantCollapsedBeforeSearchRef.current) {
      restaurantCollapsedBeforeSearchRef.current = new Set(collapsedRestaurantCategories);
      setCollapsedRestaurantCategories(new Set());
    }
  }, [search]);

  useEffect(() => {
    const needle = dishSearch.trim();
    if (!needle) {
      if (dishCollapsedBeforeSearchRef.current) {
        setCollapsedDishCategories(dishCollapsedBeforeSearchRef.current);
        dishCollapsedBeforeSearchRef.current = null;
      }
      return;
    }
    if (!dishCollapsedBeforeSearchRef.current) {
      dishCollapsedBeforeSearchRef.current = new Set(collapsedDishCategories);
    }
    if (collapsedDishCategories.size > 0) {
      setCollapsedDishCategories(new Set());
    }
  }, [dishSearch, collapsedDishCategories]);

  const fetchRestaurants = useCallback(async (cityId?: number, streetId?: number) => {
    const requestId = ++restaurantsRequestIdRef.current;
    try {
      setLoading(true);
      setRestaurants([]);
      const loadRestaurantList = async (useCity: number, useStreet: number) => {
        const response = await fetch(
          `https://www.10bis.co.il/api/SearchResListWithOrderHistoryAndPopularDishesAndRes?cityId=${useCity}&streetId=${useStreet}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        const text = await response.text();
        const data = JSON.parse(text);
        const list: Restaurant[] = Array.isArray(data?.Data?.ResList)
          ? data.Data.ResList.map((item: any) => ({
              RestaurantId: item?.RestaurantId,
              RestaurantName: item?.RestaurantName,
              RestaurantCuisineList:
                typeof item?.RestaurantCuisineList === 'string' ? item.RestaurantCuisineList : null,
            }))
          : [];
        return list;
      };

      const requestedCity = cityId ?? DEFAULT_CITY_ID;
      const requestedStreet = streetId ?? DEFAULT_STREET_ID;
      let list: Restaurant[] = [];

      try {
        list = await loadRestaurantList(requestedCity, requestedStreet);
      } catch (primaryError) {
        const shouldFallback =
          requestedCity !== DEFAULT_CITY_ID || requestedStreet !== DEFAULT_STREET_ID;
        if (!shouldFallback) {
          throw primaryError;
        }
        list = await loadRestaurantList(DEFAULT_CITY_ID, DEFAULT_STREET_ID);
      }
      if (restaurantsRequestIdRef.current !== requestId) return;

      setRestaurants(list);
      const categories = mapRestaurantsToCategories(list, t('cameraRestaurantsGroup'));
      setRestaurantCategories(categories);
      setCollapsedRestaurantCategories(new Set(categories.map((cat) => cat.id)));
    } catch (err) {
      if (restaurantsRequestIdRef.current !== requestId) return;
      setRestaurants([]);
      setRestaurantCategories([]);
      setCollapsedRestaurantCategories(new Set());
      showAppAlert(t('cameraNoRestaurantsFound'), t('cameraNoRestaurantsFound'));
    } finally {
      if (restaurantsRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [t]);

  const fetchCompanyRestaurants = useCallback(async () => {
    if (!currentUserId) return;
    const companyId = await fetchCompanyIdForUser(currentUserId);
    if (!companyId) return;
    const { data: company } = await supabase
      .from('companies')
      .select('city_id, street_id')
      .eq('id', companyId)
      .maybeSingle();
    await fetchRestaurants(company?.city_id, company?.street_id);
  }, [currentUserId, fetchRestaurants]);

  useEffect(() => {
    if (currentUserId) {
      void fetchCompanyRestaurants();
    }
    if (presetRestaurantId) {
      setSelectedRestaurantId(presetRestaurantId);
      setSelectedName(presetRestaurantName);
    }
  }, [currentUserId, fetchCompanyRestaurants, presetRestaurantId, presetRestaurantName]);

  const handleSave = async () => {
    if (saving || saveInFlightRef.current) return;
    if (!photoUri) {
      showAppAlert(t('cameraMissingImageTitle'), t('cameraTakePhotoFirst'));
      return;
    }
    if (!selectedRestaurantId) {
      showAppAlert(t('cameraMissingRestaurantTitle'), t('cameraChooseRestaurant'));
      return;
    }
    if (!selectedDish?.id) {
      showAppAlert(t('cameraMissingDishTitle'), t('cameraChooseDish'));
      return;
    }
    try {
      saveInFlightRef.current = true;
      setSaving(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const authenticatedUserId = authData.user?.id ?? null;
      if (authError || !authenticatedUserId) {
        showAppAlert(t('cameraNotSignedInTitle'), t('cameraSignInAgain'));
        return;
      }
      if (authenticatedUserId !== currentUserId) {
        setCurrentUserId(authenticatedUserId);
      }
      const { ext, contentType } = getImageContentType(photoUri);
      const filePath = `${authenticatedUserId}/${draftSubmissionKeyRef.current}.${ext}`;
      const bytes = photoBase64
        ? (() => {
            const binary = globalThis.atob
              ? globalThis.atob(photoBase64)
              : Buffer.from(photoBase64, 'base64').toString('binary');
            const len = binary.length;
            const rawBytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) rawBytes[i] = binary.charCodeAt(i);
            return rawBytes.buffer;
          })()
        : await loadImageBytesFromUri(photoUri);
      const upload = await supabase.storage
        .from('dish-images')
        .upload(filePath, bytes, {
          contentType,
          upsert: true,
      });
      if (upload.error) throw upload.error;
      const { data: publicData } = supabase.storage.from('dish-images').getPublicUrl(filePath);
      const { data: existingRows, error: existingRowsError } = await supabase
        .from('dish_associations')
        .select('id')
        .eq('user_id', authenticatedUserId)
        .eq('image_path', filePath)
        .limit(1);
      if (existingRowsError) throw existingRowsError;
      if ((existingRows ?? []).length > 0) {
        router.replace({
          pathname: '/',
          params: {
            refresh: String(Date.now()),
            headerSync: String(Date.now()),
            homeTab: 'dishes',
            scrollY: '0',
          },
        });
        return;
      }
      const insert = await supabase.from('dish_associations').insert({
        user_id: authenticatedUserId,
        restaurant_id: selectedRestaurantId,
        restaurant_name: selectedName ?? null,
        cuisine: selectedRestaurantCuisine,
        dish_id: selectedDish.id,
        dish_name: selectedDish.name,
        review_text: reviewText,
        tasty_score: starsToScore(tastyScore),
        filling_score: starsToScore(fillingScore),
        image_url: publicData?.publicUrl ?? null,
        image_path: filePath,
        created_at: new Date().toISOString(),
      });
      if (insert.error) throw insert.error;
      draftSubmissionKeyRef.current = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      router.replace({
        pathname: '/',
        params: {
          refresh: String(Date.now()),
          headerSync: String(Date.now()),
          homeTab: 'dishes',
          scrollY: '0',
        },
      });
    } catch (error) {
      showAppAlert(
        t('cameraSaveFailed'),
        error instanceof Error ? error.message : t('cameraSaveFailed')
      );
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          {
            paddingBottom:
              keyboardInset > 0
                ? 24 + keyboardInset
                : 120 + Math.max(insets.bottom, 12),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={Keyboard.dismiss}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.replace('/')}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
            <Text style={styles.backText}>{t('cameraDetailsBack')}</Text>
          </Pressable>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>{t('cameraDetailsTitle')}</Text>
          </View>
        </View>
        <View style={styles.photoRow}>
          <Pressable
            style={photoUri ? styles.photoPressable : styles.photoPlaceholder}
            onPress={() =>
              router.push({
                pathname: '/camera',
                params: {
                  restaurantId: selectedRestaurantId ? String(selectedRestaurantId) : '',
                  restaurantName: selectedName ?? '',
                  dishId: selectedDish?.id ? String(selectedDish.id) : '',
                  dishName: selectedDish?.name ?? '',
                  lockSelection: lockSelection ? '1' : '',
                },
              })
            }
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : defaultImageUrl ? (
              <Image source={{ uri: defaultImageUrl }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholderInner}>
                <Ionicons
                  name="image-outline"
                  size={22}
                  color={theme.colors.textMuted}
                />
                <Text style={styles.photoPlaceholderHint}>
                  אין עדיין תמונה
                </Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Ionicons name="camera" size={20} color="#ffffff" />
              <Text style={styles.cameraOverlayText}>
                {photoUri ? t('cameraRetake') : t('cameraTakeDishPhoto')}
              </Text>
            </View>
          </Pressable>
        </View>
        <TextInput
          style={styles.reviewInput}
          placeholder={t('cameraReviewPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          textAlign="right"
          value={reviewText}
          onChangeText={setReviewText}
          onLayout={(event) => {
            reviewInputYRef.current = event.nativeEvent.layout.y;
          }}
          onFocus={() => {
            const targetY = Math.max(0, reviewInputYRef.current - 96);
            scrollRef.current?.scrollTo({ y: targetY, animated: true });
          }}
        />

        <View
          style={styles.dropdownContainer}
          onLayout={(event) => {
            restaurantDropdownYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <Pressable
            style={[styles.dropdownHeader, lockSelection && styles.dropdownHeaderLocked]}
            onPress={() => {
              if (lockSelection) return;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setDropdownOpen((prev) => !prev);
            }}
            disabled={loading || lockSelection}
          >
            <Text style={[styles.dropdownText, !selectedName && styles.dropdownPlaceholder]}>
              {loading ? t('cameraLoadingRestaurants') : selectedName ?? t('searchChooseRestaurant')}
            </Text>
            {!lockSelection ? (
              <View style={styles.chevronCircle}>
                <Ionicons
                  name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="theme.colors.accent"
                />
              </View>
            ) : null}
          </Pressable>
          {dropdownOpen && !lockSelection && (
            <View style={styles.dropdownList}>
              <View style={[styles.dropdownControlsRow, !isRTL && styles.dropdownControlsRowLtr]}>
                <Pressable
                  style={[
                    styles.dropdownControlButton,
                    !allRestaurantCategoriesCollapsed && styles.dropdownControlButtonActive,
                  ]}
                  onPress={() => setCollapsedRestaurantCategories(new Set())}
                >
                  <Text
                    style={[
                      styles.dropdownControlText,
                      !allRestaurantCategoriesCollapsed && styles.dropdownControlTextActive,
                    ]}
                  >
                    {t('searchExpandAll')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dropdownControlButton,
                    allRestaurantCategoriesCollapsed && styles.dropdownControlButtonActive,
                  ]}
                  onPress={() =>
                    setCollapsedRestaurantCategories(
                      new Set(restaurantCategories.map((cat) => cat.id))
                    )
                  }
                >
                  <Text
                    style={[
                      styles.dropdownControlText,
                      allRestaurantCategoriesCollapsed && styles.dropdownControlTextActive,
                    ]}
                  >
                    {t('searchCollapseAll')}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.searchRow, !isRTL && styles.searchRowLtr]}>
                <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, !isRTL && styles.searchInputLtr]}
                  placeholder={t('cameraSearchRestaurantPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={search}
                  onChangeText={(text) => setSearch(text)}
                  onFocus={() => {
                    restaurantSearchFocusedRef.current = true;
                    dishSearchFocusedRef.current = false;
                    const targetY = Math.max(0, restaurantDropdownYRef.current - SEARCH_FIELD_TOP_GUTTER);
                    scrollRef.current?.scrollTo({ y: targetY, animated: true });
                  }}
                  onBlur={() => {
                    hasNudgedRestaurantSearchRef.current = false;
                    restaurantSearchFocusedRef.current = false;
                  }}
                />
              </View>
              {restaurants.length === 0 ? (
                <Text style={styles.dropdownEmpty}>{t('cameraNoRestaurantsFound')}</Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.dropdownScroll}
                >
                  {buildRestaurantRows(
                    restaurantCategories,
                    search,
                    collapsedRestaurantCategories
                  ).map((item) =>
                    item.type === 'header' ? (
                      <Pressable
                        key={item.id}
                        style={styles.categoryHeader}
                        onPress={() =>
                          setCollapsedRestaurantCategories((prev) => {
                            LayoutAnimation.configureNext(
                              LayoutAnimation.Presets.easeInEaseOut
                            );
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
                        key={item.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedName(item.item.RestaurantName);
                          setSelectedRestaurantId(item.item.RestaurantId);
                          setSelectedRestaurantCuisine(
                            getPrimaryCuisine(item.item.RestaurantCuisineList)
                          );
                          setDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{item.item.RestaurantName}</Text>
                      </Pressable>
                    )
                  )}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        <View
          style={styles.dropdownContainer}
          onLayout={(event) => {
            dishDropdownYRef.current = event.nativeEvent.layout.y;
          }}
        >
          <Pressable
            style={[styles.dropdownHeader, lockSelection && styles.dropdownHeaderLocked]}
            onPress={() => {
              if (lockSelection) return;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setDishDropdownOpen((prev) => !prev);
            }}
            disabled={loading || !selectedRestaurantId || lockSelection}
          >
            <Text style={[styles.dropdownText, !selectedDish && styles.dropdownPlaceholder]}>
              {!selectedRestaurantId
                ? t('cameraChooseRestaurantFirst')
                : selectedDish?.name ?? t('searchDishPrompt')}
            </Text>
            {!lockSelection ? (
              <View style={styles.chevronCircle}>
                <Ionicons
                  name={dishDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="theme.colors.accent"
                />
              </View>
            ) : null}
          </Pressable>
          {dishDropdownOpen && !lockSelection && (
            <View style={styles.dropdownList}>
              <View style={[styles.dropdownControlsRow, !isRTL && styles.dropdownControlsRowLtr]}>
                <Pressable
                  style={[
                    styles.dropdownControlButton,
                    !allDishCategoriesCollapsed && styles.dropdownControlButtonActive,
                  ]}
                  onPress={() => setCollapsedDishCategories(new Set())}
                >
                  <Text
                    style={[
                      styles.dropdownControlText,
                      !allDishCategoriesCollapsed && styles.dropdownControlTextActive,
                    ]}
                  >
                    {t('searchExpandAll')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dropdownControlButton,
                    allDishCategoriesCollapsed && styles.dropdownControlButtonActive,
                  ]}
                  onPress={() =>
                    setCollapsedDishCategories(new Set(dishCategories.map((cat) => cat.id)))
                  }
                >
                  <Text
                    style={[
                      styles.dropdownControlText,
                      allDishCategoriesCollapsed && styles.dropdownControlTextActive,
                    ]}
                  >
                    {t('searchCollapseAll')}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.searchRow, !isRTL && styles.searchRowLtr]}>
                <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                <TextInput
                  style={[styles.searchInput, !isRTL && styles.searchInputLtr]}
                  placeholder={t('searchDishPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={dishSearch}
                  onChangeText={(text) => setDishSearch(text)}
                  onFocus={() => {
                    dishSearchFocusedRef.current = true;
                    restaurantSearchFocusedRef.current = false;
                    const targetY = Math.max(0, dishDropdownYRef.current - SEARCH_FIELD_TOP_GUTTER);
                    scrollRef.current?.scrollTo({ y: targetY, animated: true });
                    if (hasNudgedDishSearchRef.current) return;
                    hasNudgedDishSearchRef.current = true;
                  }}
                  onBlur={() => {
                    hasNudgedDishSearchRef.current = false;
                    dishSearchFocusedRef.current = false;
                  }}
                />
              </View>
              {menuLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.text} />
                  <Text style={styles.dropdownEmpty}>{t('cameraLoadingDishes')}</Text>
                </View>
              ) : dishCategories.length === 0 ? (
                <Text style={styles.dropdownEmpty}>{t('searchNoDishesFound')}</Text>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  contentContainerStyle={styles.dropdownScroll}
                >
                  {buildDropdownRows(dishCategories, dishSearch, collapsedDishCategories).map(
                    (item) =>
                      item.type === 'header' ? (
                        <Pressable
                          key={item.id}
                          style={styles.categoryHeader}
                          onPress={() =>
                            setCollapsedDishCategories((prev) => {
                              LayoutAnimation.configureNext(
                                LayoutAnimation.Presets.easeInEaseOut
                              );
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
                          key={item.id}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setSelectedDish(item.item);
                            setDishDropdownOpen(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{item.item.name}</Text>
                        </Pressable>
                      )
                  )}
                </ScrollView>
              )}
            </View>
          )}
        </View>

        <Text style={[styles.ratingHeader, !isRTL && styles.ratingHeaderLtr]}>{t('cameraRateDish')}</Text>
        <View style={[styles.sliderRow, !isRTL && styles.sliderRowLtr]}>
          <View style={[styles.sliderLabelRow, !isRTL && styles.sliderLabelRowLtr]}>
            <Text style={[styles.sliderText, !isRTL && styles.sliderTextLtr]}>{t('ratingTasty')}</Text>
          </View>
          <View style={[styles.starInputWrap, !isRTL && styles.starInputWrapLtr]}>
            <EmojiRatingInput value={tastyScore} onChange={setTastyScore} size={44} />
          </View>
        </View>
        <View style={[styles.sliderRow, !isRTL && styles.sliderRowLtr]}>
          <View style={[styles.sliderLabelRow, !isRTL && styles.sliderLabelRowLtr]}>
            <Text style={[styles.sliderText, !isRTL && styles.sliderTextLtr]}>{t('ratingSize')}</Text>
          </View>
          <View style={[styles.starInputWrap, !isRTL && styles.starInputWrapLtr]}>
            <EmojiRatingInput value={fillingScore} onChange={setFillingScore} size={44} />
          </View>
        </View>

        </Pressable>
      </ScrollView>
      <View style={[styles.saveFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !isRTL && styles.saveButtonLtr,
            pressed && !saving && photoUri && styles.saveButtonPressed,
            (saving || !photoUri) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving || saveInFlightRef.current || !photoUri}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Text style={styles.saveButtonText}>{t('commonSave')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 36,
    gap: 12,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  saveFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  scrollHint: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardAlt,
    marginTop: 4,
  },
  scrollHintText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 14,
    marginBottom: 10,
  },
  backButton: {
    height: 32,
    minWidth: 64,
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  backText: {
    fontSize: 12,
    color: theme.colors.text,
    textAlign: 'right',
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
  },
  photoRow: {
    alignItems: 'center',
  },
  photo: {
    width: 260,
    height: 180,
    borderRadius: 8,
    backgroundColor: theme.colors.cardAlt,
  },
  photoPressable: {
    width: 260,
    height: 180,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 2,
  },
  photoPlaceholder: {
    width: 260,
    height: 180,
    borderRadius: 8,
    backgroundColor: theme.colors.cardAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
    gap: 6,
  },
  photoPlaceholderHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  cameraOverlay: {
    position: 'absolute',
    right: 0,
    left: 0,
    bottom: 0,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cameraOverlayText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  placeholder: {
    width: 180,
    height: 120,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: theme.colors.textMuted,
  },
  reviewInput: {
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    fontSize: 16,
    color: theme.colors.text,
    paddingVertical: 6,
    marginTop: 6,
    marginBottom: 20,
  },
  dropdownContainer: {
    width: '100%',
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
  dropdownHeaderLocked: {
    opacity: 0.9,
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
  dropdownList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    maxHeight: 220,
    backgroundColor: theme.colors.card,
  },
  dropdownControlsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dropdownControlsRowLtr: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  dropdownControlButton: {
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
  dropdownControlButtonActive: {
    borderColor: 'rgba(244,135,34,0.40)',
    backgroundColor: 'rgba(255,241,224,0.96)',
  },
  dropdownControlText: {
    fontSize: 10,
    fontFamily: theme.typography.semibold,
    color: theme.colors.textMuted,
  },
  dropdownControlTextActive: {
    color: theme.colors.accent,
  },
  dropdownScroll: {
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchRowLtr: {
    flexDirection: 'row',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
  },
  searchInputLtr: {
    textAlign: 'left',
  },
  dropdownEmpty: {
    padding: 12,
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
  searchResultCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: theme.colors.cardAlt,
  },
  searchResultInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'right',
  },
  searchResultSubtitle: {
    marginTop: 4,
    fontSize: 11,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  searchResultImageWrap: {
    width: 62,
    height: 46,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  searchResultPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.card,
  },
  searchResultOverlay: {
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
  searchResultOverlayText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '600',
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  chevronCircle: {
    height: 28,
    width: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingHeader: {
    marginTop: 28,
    fontSize: 16,
    color: theme.colors.text,
    textAlign: 'right',
    fontWeight: '600',
  },
  ratingHeaderLtr: {
    textAlign: 'left',
  },
  sliderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 4 : 0,
    marginBottom: 12,
    justifyContent: Platform.OS === 'ios' ? 'flex-start' : 'flex-end',
    width: '100%',
    paddingRight: Platform.OS === 'ios' ? 20 : 32,
  },
  sliderRowLtr: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingRight: 0,
    paddingLeft: Platform.OS === 'ios' ? 20 : 0,
  },
  starInputWrap: {
    flex: 0,
    alignItems: 'flex-end',
    marginRight: Platform.OS === 'ios' ? 2 : 0,
  },
  starInputWrapLtr: {
    alignItems: 'flex-start',
    marginRight: 0,
    marginLeft: Platform.OS === 'ios' ? 2 : 0,
  },
  sliderLabel: {
    width: 90,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sliderLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: Platform.OS === 'ios' ? 74 : 92,
    justifyContent: 'flex-end',
    marginLeft: 2,
    paddingRight: Platform.OS === 'ios' ? 4 : 20,
    height: 44,
  },
  sliderLabelRowLtr: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginLeft: Platform.OS === 'ios' ? 4 : 0,
    marginRight: 0,
    paddingRight: 0,
    paddingLeft: 0,
  },
  sliderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'center',
    lineHeight: 44,
    width: '100%',
  },
  sliderTextLtr: {
    textAlign: 'left',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: 'flex-start',
  },
  saveButtonLtr: {
    alignSelf: 'flex-end',
  },
  saveButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
});
