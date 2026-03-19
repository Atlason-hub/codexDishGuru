import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchCompanyLogoForCurrentUser, loadCachedLogo } from '../../lib/logo';

type Restaurant = {
  RestaurantId: number;
  RestaurantName: string;
};

export default function CameraDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoUri = typeof params.photoUri === 'string' ? decodeURIComponent(params.photoUri) : null;

  const [menuVisible, setMenuVisible] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [dishes, setDishes] = useState<string[]>([]);
  const [dishDropdownOpen, setDishDropdownOpen] = useState(false);
  const [dishSearch, setDishSearch] = useState('');
  const [selectedDish, setSelectedDish] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyLogoAndRestaurants();
  }, []);

  const fetchCompanyLogoAndRestaurants = async () => {
    const cachedLogo = await loadCachedLogo();
    if (cachedLogo.logoUrl) setCompanyLogoUrl(cachedLogo.logoUrl);
    const logoRes = await fetchCompanyLogoForCurrentUser();
    setCompanyLogoUrl(logoRes.logoUrl);
    setUserEmail(logoRes.email);

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

  const fetchDishes = async (resId: number) => {
    try {
      setDishDropdownOpen(true);
      setSelectedDish(null);
      setDishes([]);
      const response = await fetch(
        `https://www.10bis.co.il/api/GetMenu?ResId=${resId}&websiteID=10bis&domainID=10bis`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const text = await response.text();
      const data = JSON.parse(text);
      const categories: any[] = Array.isArray(data?.Data) ? data.Data : [];
      const names: string[] = [];
      categories.forEach((cat) => {
        const dishesArr = Array.isArray(cat?.Dishes) ? cat.Dishes : [];
        dishesArr.forEach((d: any) => {
          if (typeof d?.DishName === 'string') names.push(d.DishName);
        });
      });
      setDishes(names);
    } catch (err) {
      console.error(err);
    }
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
      <View style={styles.header}>
        <View style={styles.leftIcons}>
          <Pressable style={styles.iconButton} onPress={() => router.push('/camera')}>
            <Ionicons name="camera" size={24} color="#111111" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => {}}>
            <Ionicons name="search" size={24} color="#111111" />
          </Pressable>
        </View>
        <Pressable style={styles.logoContainer} onPress={() => router.push('/')}>
          {companyLogoUrl ? (
            <Image source={{ uri: companyLogoUrl }} style={styles.logoImage} />
          ) : (
            <Text style={styles.logoText}>DishGuru</Text>
          )}
        </Pressable>
        <View style={styles.rightIcons}>
          <Pressable style={styles.iconButton} onPress={() => setMenuVisible((p) => !p)}>
            <Ionicons name="menu" size={28} color="#111111" />
          </Pressable>
        </View>
      </View>
      {menuVisible && (
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)} />
          <View style={styles.menuOverlay}>
            <Pressable style={styles.menuClose} onPress={() => setMenuVisible(false)}>
              <Ionicons name="close" size={20} color="#333333" />
            </Pressable>
            <View style={styles.menuUserRow}>
              <Ionicons name="person-circle-outline" size={36} color="#111111" />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.menuLabel}>{userEmail ?? 'User'}</Text>
              </View>
            </View>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Privacy</Text>
            </Pressable>
            <Pressable style={styles.menuOptionRow}>
              <Text style={styles.menuOption}>Terms</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.body}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.thumb} />
        ) : (
          <Text style={styles.placeholder}>No photo available</Text>
        )}

        <View style={styles.dropdownContainer}>
          <Pressable
            style={styles.dropdownHeader}
            onPress={() => setDropdownOpen((prev) => !prev)}
            disabled={loading}
          >
            <Text style={styles.dropdownText}>
              {loading ? 'Loading restaurants…' : selectedName ?? 'Select restaurant'}
            </Text>
            <Ionicons
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#111111"
            />
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
                        fetchDishes(item.RestaurantId);
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
            <Text style={styles.dropdownText}>
              {!selectedRestaurantId
                ? 'Select a restaurant first'
                : selectedDish ?? 'Select dish'}
            </Text>
            <Ionicons
              name={dishDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#111111"
            />
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
              {dishes.length === 0 ? (
                <Text style={styles.dropdownEmpty}>No dishes found</Text>
              ) : (
                <FlatList
                  data={dishes.filter((name) =>
                    name.toLowerCase().startsWith(dishSearch.toLowerCase())
                  )}
                  keyExtractor={(item, idx) => `${item}-${idx}`}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => {
                        setSelectedDish(item);
                        setDishDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{item}</Text>
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#ffffff',
    marginTop: 6,
  },
  leftIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 96,
  },
  rightIcons: {
    width: 96,
    alignItems: 'flex-end',
  },
  iconButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  logoImage: {
    width: 160,
    height: 40,
    resizeMode: 'contain',
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 18,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuOverlay: {
    position: 'absolute',
    top: 64,
    right: 16,
    width: 200,
    zIndex: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  menuClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    marginBottom: 4,
  },
  menuOption: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  menuOptionRow: {
    paddingVertical: 4,
  },
  menuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  thumb: {
    width: 180,
    height: 180,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    width: 180,
    height: 180,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#9CA3AF',
  },
  dropdownContainer: {
    width: '100%',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  dropdownText: {
    fontSize: 14,
    color: '#111111',
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
});
