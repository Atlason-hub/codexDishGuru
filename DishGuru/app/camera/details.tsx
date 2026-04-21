import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { theme } from '../../lib/theme';
import { starsToScore } from '../../lib/ratings';
import EmojiRatingInput from '../../components/EmojiRatingInput';
import { showAppAlert } from '../../lib/appDialog';
import { useLocale } from '../../lib/locale';

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
  const params = useLocalSearchParams();
  const scrollRef = useRef<ScrollView | null>(null);
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

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  useEffect(() => {
    if (!selectedRestaurantId) return;
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
        setDishCategories(curated);
        setCollapsedDishCategories(new Set());
      } catch {
      } finally {
        setMenuLoading(false);
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

  const fetchRestaurants = useCallback(async (cityId?: number, streetId?: number) => {
    try {
      setLoading(true);
      setRestaurants([]);
      const useCity = cityId ?? 14;
      const useStreet = streetId ?? 54730;
      const response = await fetch(
        `https://www.10bis.co.il/api/SearchResListWithOrderHistoryAndPopularDishesAndRes?cityId=${useCity}&streetId=${useStreet}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
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
      setRestaurants(list);
      const categories = mapRestaurantsToCategories(list, t('cameraRestaurantsGroup'));
      setRestaurantCategories(categories);
      setCollapsedRestaurantCategories(new Set(categories.map((cat) => cat.id)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCompanyRestaurants = useCallback(async () => {
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
    fetchRestaurants(company?.city_id, company?.street_id);
  }, [fetchRestaurants]);

  useEffect(() => {
    fetchCompanyRestaurants();
    if (presetRestaurantId) {
      setSelectedRestaurantId(presetRestaurantId);
      setSelectedName(presetRestaurantName);
    }
  }, [fetchCompanyRestaurants, presetRestaurantId, presetRestaurantName]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
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
            ) : null}
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
          onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.dropdownContainer}>
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
                  <View style={styles.searchRow}>
                    <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                    <TextInput
                  style={styles.searchInput}
          placeholder={t('cameraSearchRestaurantPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={search}
                  onChangeText={(text) => setSearch(text)}
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

        <View style={styles.dropdownContainer}>
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
              <View style={styles.dropdownControlsRow}>
                <Pressable
                  style={styles.dropdownControlButton}
                  onPress={() => setCollapsedDishCategories(new Set())}
                >
                  <Text style={styles.dropdownControlText}>{t('searchExpandAll')}</Text>
                </Pressable>
                <Pressable
                  style={styles.dropdownControlButton}
                  onPress={() =>
                    setCollapsedDishCategories(new Set(dishCategories.map((cat) => cat.id)))
                  }
                >
                  <Text style={styles.dropdownControlText}>{t('searchCollapseAll')}</Text>
                </Pressable>
              </View>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={theme.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('searchDishPlaceholder')}
                  placeholderTextColor={theme.colors.textMuted}
                  value={dishSearch}
                  onChangeText={(text) => setDishSearch(text)}
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

        <Text style={styles.ratingHeader}>{t('cameraRateDish')}</Text>
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabelRow}>
            <Text style={styles.sliderText}>{t('ratingTasty')}</Text>
          </View>
          <View style={styles.starInputWrap}>
            <EmojiRatingInput value={tastyScore} onChange={setTastyScore} size={44} />
          </View>
        </View>
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabelRow}>
            <Text style={styles.sliderText}>{t('ratingSize')}</Text>
          </View>
          <View style={styles.starInputWrap}>
            <EmojiRatingInput value={fillingScore} onChange={setFillingScore} size={44} />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !isRTL && styles.saveButtonLtr,
            pressed && !saving && photoUri && photoBase64 && styles.saveButtonPressed,
            (saving || !photoUri || !photoBase64) && styles.saveButtonDisabled,
          ]}
          onPress={async () => {
            if (saving) return;
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
              setSaving(true);
              const { data: sessionData } = await supabase.auth.getSession();
              const userId = sessionData.session?.user?.id;
              if (!userId) {
                showAppAlert(t('cameraNotSignedInTitle'), t('cameraSignInAgain'));
                return;
              }
            if (!photoBase64) {
                showAppAlert(t('cameraMissingImageTitle'), t('cameraRetakePhotoPrompt'));
              return;
            }
              const ext = photoUri.split('.').pop()?.split('?')[0] ?? 'jpg';
              const filePath = `${userId}/${Date.now()}.${ext}`;
              const base64ToArrayBuffer = (b64: string) => {
                const binary = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
                const len = binary.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
                return bytes.buffer;
              };
              const bytes = base64ToArrayBuffer(photoBase64);
              const upload = await supabase.storage
                .from('dish-images')
                .upload(filePath, bytes, {
                  contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                  upsert: true,
                });
              if (upload.error) throw upload.error;
              const { data: publicData } = supabase.storage.from('dish-images').getPublicUrl(filePath);
              const insert = await supabase.from('dish_associations').insert({
                user_id: userId,
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
              router.replace('/');
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showAppAlert(t('cameraSaveFailed'), message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Text style={styles.saveButtonText}>{t('commonSave')}</Text>
          )}
        </Pressable>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: Platform.OS === 'android' ? 48 : 24,
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
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
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
  dropdownScroll: {
    paddingBottom: 6,
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
  sliderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 0,
    marginBottom: 12,
    justifyContent: 'flex-end',
    width: '100%',
    paddingRight: 32,
  },
  starInputWrap: {
    flex: 0,
    alignItems: 'flex-end',
    marginRight: 0,
  },
  sliderLabel: {
    width: 90,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sliderLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: 92,
    justifyContent: 'flex-end',
    marginLeft: 2,
    paddingRight: 20,
    height: 44,
  },
  sliderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'center',
    lineHeight: 44,
    width: '100%',
  },
  saveButton: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignSelf: 'flex-start',
    marginBottom: 12,
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
