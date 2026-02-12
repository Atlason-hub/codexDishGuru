import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  Alert,
  View,
} from 'react-native';
import { useState } from 'react';

type Restaurant = {
  RestaurantId: number;
  RestaurantName: string;
  StartOrderURL?: string;
};

const extractNamesFromXml = (xml: string): Restaurant[] => {
  const results: Restaurant[] = [];
  const pattern = /<RestaurantName>([\s\S]*?)<\/RestaurantName>/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(xml)) !== null) {
    const raw = match[1].trim();
    if (raw.length > 0) {
      results.push({ RestaurantId: index + 1, RestaurantName: raw });
      index += 1;
    }
  }
  return results;
};

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);

  const runApi = async () => {
    try {
      setLoading(true);
      setError(null);
      setRestaurants([]);
      const response = await fetch(
        'https://www.10bis.co.il/api/SearchResListWithOrderHistoryAndPopularDishesAndRes?cityId=14&streetId=54730',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        const list: Restaurant[] = Array.isArray(data?.Data?.ResList)
          ? data.Data.ResList
              .map((item: any) => ({
                RestaurantId: item?.RestaurantId,
                RestaurantName: item?.RestaurantName,
                StartOrderURL: item?.StartOrderURL,
              }))
              .filter(
                (item: Restaurant) =>
                  typeof item.RestaurantName === 'string' && item.RestaurantName.length > 0
              )
          : [];
        setRestaurants(list);
      } catch {
        setRestaurants(extractNamesFromXml(text));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>DishGuru</Text>
      <View style={styles.results}>
        {loading && <ActivityIndicator size="large" />}
        {!loading && error && <Text style={styles.errorText}>{error}</Text>}
        {!loading && !error && restaurants.length > 0 && (
          <FlatList
            data={restaurants}
            keyExtractor={(item) => String(item.RestaurantId)}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={() => {
                  if (item.StartOrderURL) {
                    Linking.openURL(item.StartOrderURL);
                  } else {
                    Alert.alert('Menu link not available', 'This restaurant did not include a menu URL.');
                  }
                }}
              >
                <Text style={styles.cardTitle}>{item.RestaurantName}</Text>
                {item.StartOrderURL ? (
                  <Text style={styles.cardSubtitle}>Open menu</Text>
                ) : (
                  <Text style={styles.cardSubtitleMuted}>Menu link not available</Text>
                )}
              </Pressable>
            )}
          />
        )}
        {!loading && !error && restaurants.length === 0 && (
          <Text style={styles.placeholderText}>Tap “Run API” to load data.</Text>
        )}
      </View>
      <Pressable style={[styles.button, styles.runApiButton]} onPress={runApi}>
        <Text style={styles.buttonText}>Run API</Text>
      </Pressable>
      <Pressable
        style={[styles.button, styles.refreshButton]}
        onPress={() => {
          setError(null);
          setRestaurants([]);
        }}
      >
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  text: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  results: {
    alignSelf: 'stretch',
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  listContent: {
    paddingBottom: 160,
    gap: 10,
  },
  placeholderText: {
    color: '#666666',
    fontSize: 14,
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111111',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#1a1a1a',
  },
  cardSubtitleMuted: {
    marginTop: 4,
    fontSize: 12,
    color: '#888888',
  },
  button: {
    position: 'absolute',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111111',
    backgroundColor: '#ffffff',
  },
  runApiButton: {
    bottom: 88,
  },
  refreshButton: {
    bottom: 32,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
