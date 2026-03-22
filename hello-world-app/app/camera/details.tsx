import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Buffer } from 'buffer';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

type Restaurant = {
  RestaurantId: number;
  RestaurantName: string;
};

type DishItem = {
  id: number;
  name: string;
};

export default function CameraDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
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

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [dishes, setDishes] = useState<DishItem[]>([]);
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false);
  const [dishSearch, setDishSearch] = useState('');
  const [selectedDish, setSelectedDish] = useState<DishItem | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [tastyScore, setTastyScore] = useState(60);
  const [fastScore, setFastScore] = useState(60);
  const [fillingScore, setFillingScore] = useState(60);
  const [reviewText, setReviewText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedRestaurantId) return;
    const fetchMenu = async () => {
      try {
        setMenuLoading(true);
        if (!presetDishId) setSelectedDish(null);
        setDishes([]);
        const response = await fetch(
          `https://www.10bis.co.il/api/GetMenu?ResId=${selectedRestaurantId}&websiteID=10bis&domainID=10bis`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const text = await response.text();
        const data = JSON.parse(text);
        const categories: any[] = Array.isArray(data?.Data)
          ? data.Data
          : Array.isArray(data?.Data?.Categories)
          ? data.Data.Categories
          : [];
        const items: DishItem[] = [];
        categories.forEach((cat) => {
          const dishesArr = Array.isArray(cat?.DishList)
            ? cat.DishList
            : Array.isArray(cat?.Dishes)
            ? cat.Dishes
            : [];
          dishesArr.forEach((d: any) => {
            const name =
              typeof d?.DishName === 'string' ? d.DishName : typeof d?.Name === 'string' ? d.Name : null;
            const id =
              typeof d?.DishId === 'number'
                ? d.DishId
                : typeof d?.Id === 'number'
                ? d.Id
                : typeof d?.DishID === 'number'
                ? d.DishID
                : null;
            if (name && id !== null) items.push({ id, name });
          });
        });
        if (items.length === 0 && Array.isArray(data?.Data?.Dishes)) {
          data.Data.Dishes.forEach((d: any) => {
            const name =
              typeof d?.DishName === 'string' ? d.DishName : typeof d?.Name === 'string' ? d.Name : null;
            const id =
              typeof d?.DishId === 'number'
                ? d.DishId
                : typeof d?.Id === 'number'
                ? d.Id
                : typeof d?.DishID === 'number'
                ? d.DishID
                : null;
            if (name && id !== null) items.push({ id, name });
          });
        }
        setDishes(items);
      } catch (error) {
        console.log('[MENU_FETCH_ERROR]:', error);
      } finally {
        setMenuLoading(false);
      }
    };
    fetchMenu();
  }, [selectedRestaurantId]);

  useEffect(() => {
    fetchCompanyRestaurants();
    if (presetRestaurantId) {
      setSelectedRestaurantId(presetRestaurantId);
      setSelectedName(presetRestaurantName);
    }
  }, []);

  useEffect(() => {
    if (presetDishId && presetDishName) {
      setSelectedDish({ id: presetDishId, name: presetDishName });
    }
  }, [presetDishId, presetDishName, dishes]);

  const fetchCompanyRestaurants = async () => {
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
  };

  const fetchRestaurants = async (cityId?: number, streetId?: number) => {
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
          }))
        : [];
      setRestaurants(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <View style={styles.photoRow}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <Text style={styles.placeholder}>No photo available</Text>
          )}
        </View>
        <TextInput
          style={styles.reviewInput}
          placeholder="כתוב דעתך על המנה"
          placeholderTextColor="#9CA3AF"
          multiline
          textAlign="right"
          value={reviewText}
          onChangeText={setReviewText}
        />

        <View style={styles.dropdownContainer}>
          <Pressable
            style={styles.dropdownHeader}
            onPress={() => setDropdownOpen((prev) => !prev)}
            disabled={loading}
          >
            <Text style={[styles.dropdownText, !selectedName && styles.dropdownPlaceholder]}>
              {loading ? 'טוען מסעדות…' : selectedName ?? 'בחר מסעדה'}
            </Text>
            <View style={styles.chevronCircle}>
              <Ionicons
                name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#F87171"
              />
            </View>
          </Pressable>
          {dropdownOpen && (
            <View style={styles.dropdownList}>
                  <View style={styles.searchRow}>
                    <Ionicons name="search" size={16} color="#6B7280" />
                    <TextInput
                  style={styles.searchInput}
                  placeholder="Type to search…"
                  placeholderTextColor="#9CA3AF"
                  value={search}
                  onChangeText={(text) => setSearch(text)}
                />
              </View>
              {restaurants.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No restaurants found</Text>
              ) : (
                <FlatList
                  data={restaurants.filter((r) =>
                    r.RestaurantName.toLowerCase().startsWith(search.toLowerCase())
                  )}
                  keyExtractor={(item) => String(item.RestaurantId)}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedName(item.RestaurantName);
                        setSelectedRestaurantId(item.RestaurantId);
                        setDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{item.RestaurantName}</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </View>

        <View style={styles.dropdownContainer}>
          <Pressable
            style={styles.dropdownHeader}
            onPress={() => setDishDropdownOpen((prev) => !prev)}
            disabled={loading || !selectedRestaurantId}
          >
            <Text style={[styles.dropdownText, !selectedDish && styles.dropdownPlaceholder]}>
              {!selectedRestaurantId
                ? 'בחר מסעדה קודם'
                : selectedDish?.name ?? 'הכנס שם או בחר מנה'}
            </Text>
            <View style={styles.chevronCircle}>
              <Ionicons
                name={dishDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#F87171"
              />
            </View>
          </Pressable>
          {dishDropdownOpen && (
            <View style={styles.dropdownList}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color="#6B7280" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Type to search dish…"
                  placeholderTextColor="#9CA3AF"
                  value={dishSearch}
                  onChangeText={(text) => setDishSearch(text)}
                />
              </View>
              {menuLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#111111" />
                  <Text style={styles.dropdownEmpty}>Loading dishes…</Text>
                </View>
              ) : dishes.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No dishes found</Text>
              ) : (
                <FlatList
                  data={dishes.filter((item) =>
                    item.name.toLowerCase().startsWith(dishSearch.toLowerCase())
                  )}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedDish(item);
                        setDishDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{item.name}</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </View>

        <Text style={styles.ratingHeader}>דרג את המנה</Text>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            value={tastyScore}
            onValueChange={(v) => setTastyScore(Math.round(v))}
            minimumTrackTintColor="#F87171"
            maximumTrackTintColor="#CBD5E1"
            thumbTintColor="#F87171"
          />
          <View style={styles.sliderLabel}>
            <Text style={styles.sliderValue}>{tastyScore}</Text>
            <Text style={styles.sliderText}>טעים</Text>
          </View>
        </View>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            value={fastScore}
            onValueChange={(v) => setFastScore(Math.round(v))}
            minimumTrackTintColor="#F87171"
            maximumTrackTintColor="#CBD5E1"
            thumbTintColor="#F87171"
          />
          <View style={styles.sliderLabel}>
            <Text style={styles.sliderValue}>{fastScore}</Text>
            <Text style={styles.sliderText}>מהיר</Text>
          </View>
        </View>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            value={fillingScore}
            onValueChange={(v) => setFillingScore(Math.round(v))}
            minimumTrackTintColor="#F87171"
            maximumTrackTintColor="#CBD5E1"
            thumbTintColor="#F87171"
          />
          <View style={styles.sliderLabel}>
            <Text style={styles.sliderValue}>{fillingScore}</Text>
            <Text style={styles.sliderText}>משביע</Text>
          </View>
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={async () => {
            if (saving) return;
            if (!photoUri) {
              Alert.alert('Missing image', 'Please take a photo first.');
              return;
            }
            if (!selectedRestaurantId) {
              Alert.alert('Missing restaurant', 'Please select a restaurant.');
              return;
            }
            if (!selectedDish?.id) {
              Alert.alert('Missing dish', 'Please select a dish.');
              return;
            }
            try {
              setSaving(true);
              const { data: sessionData } = await supabase.auth.getSession();
              const userId = sessionData.session?.user?.id;
              if (!userId) {
                Alert.alert('Not signed in', 'Please sign in again.');
                return;
              }
              if (!photoBase64) {
                Alert.alert('Missing image data', 'Please retake the photo.');
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
                dish_id: selectedDish.id,
                dish_name: selectedDish.name,
                review_text: reviewText,
                tasty_score: tastyScore,
                fast_score: fastScore,
                filling_score: fillingScore,
                image_url: publicData?.publicUrl ?? null,
                image_path: filePath,
                created_at: new Date().toISOString(),
              });
              if (insert.error) throw insert.error;
              Alert.alert('Saved', 'Your dish review has been saved.');
              router.replace('/');
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.log('[SAVE_DISH_ERROR]:', error);
              Alert.alert('Save failed', message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <ActivityIndicator color="#F87171" /> : <Text style={styles.saveButtonText}>שמור</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  photoRow: {
    alignItems: 'flex-end',
  },
  photo: {
    width: 180,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    width: 180,
    height: 120,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#9CA3AF',
  },
  reviewInput: {
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    fontSize: 16,
    color: '#111827',
    paddingVertical: 6,
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
    borderColor: '#CBD5E1',
    backgroundColor: '#ffffff',
  },
  dropdownText: {
    fontSize: 18,
    color: '#111827',
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  dropdownPlaceholder: {
    color: '#94A3B8',
  },
  dropdownList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    maxHeight: 220,
    backgroundColor: '#ffffff',
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
    color: '#111111',
  },
  dropdownEmpty: {
    padding: 12,
    color: '#9CA3AF',
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#111111',
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
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingHeader: {
    marginTop: 6,
    fontSize: 16,
    color: '#111827',
    textAlign: 'right',
    fontWeight: '600',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slider: {
    flex: 1,
    height: 32,
  },
  sliderLabel: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sliderText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  saveButton: {
    marginTop: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    color: '#F87171',
    textAlign: 'left',
  },
});
