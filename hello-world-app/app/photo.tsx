import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';

type DishPhoto = {
  id: string;
  image_url: string | null;
  review_text: string | null;
  dish_name: string | null;
  dish_id: number | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  created_at: string | null;
};

export default function PhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<DishPhoto | null>(null);
  const [avgScores, setAvgScores] = useState<{
    tasty: number;
    fast: number;
    filling: number;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('חסר מזהה מנה');
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
          .from('dish_associations')
          .select(
            'id, image_url, review_text, dish_name, dish_id, restaurant_name, restaurant_id, created_at'
          )
          .eq('id', id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!mounted) return;
        const base = (data as DishPhoto) ?? null;
        setPhoto(base);
        if (base?.dish_name && (base.dish_id || base.restaurant_id || base.restaurant_name)) {
          let listQuery = supabase
            .from('dish_associations')
            .select('tasty_score, fast_score, filling_score, dish_id, dish_name, restaurant_id, restaurant_name')
            .ilike('dish_name', base.dish_name);
          if (base.dish_id) {
            listQuery = listQuery.eq('dish_id', base.dish_id);
          }
          if (base.restaurant_id) {
            listQuery = listQuery.eq('restaurant_id', base.restaurant_id);
          } else if (base.restaurant_name) {
            listQuery = listQuery.ilike('restaurant_name', base.restaurant_name);
          }
          const { data: list, error: listError } = await listQuery;
          if (!listError && Array.isArray(list) && list.length > 0) {
            let tastySum = 0;
            let tastyCount = 0;
            let fastSum = 0;
            let fastCount = 0;
            let fillingSum = 0;
            let fillingCount = 0;
            list.forEach((row: any) => {
              if (typeof row.tasty_score === 'number') {
                tastySum += row.tasty_score;
                tastyCount += 1;
              }
              if (typeof row.fast_score === 'number') {
                fastSum += row.fast_score;
                fastCount += 1;
              }
              if (typeof row.filling_score === 'number') {
                fillingSum += row.filling_score;
                fillingCount += 1;
              }
            });
            setAvgScores({
              tasty: tastyCount ? tastySum / tastyCount : 0,
              fast: fastCount ? fastSum / fastCount : 0,
              filling: fillingCount ? fillingSum / fillingCount : 0,
            });
          } else {
            setAvgScores(null);
          }
        } else {
          setAvgScores(null);
        }
      } catch (err) {
        if (mounted) setError('אירעה שגיאה. נסה שוב.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#111111" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{photo?.dish_name ?? 'מנה'}</Text>
          <Text style={styles.headerSubtitle}>{photo?.restaurant_name ?? ''}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.results}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : photo?.image_url ? (
        <View style={styles.content}>
          <Pressable style={styles.imageWrap} onPress={() => setPreviewOpen(true)}>
            <Image source={{ uri: photo.image_url }} style={styles.image} contentFit="cover" />
            <View style={styles.imageHint}>
              <Ionicons name="expand" size={16} color="#ffffff" />
              <Text style={styles.imageHintText}>הצג במסך מלא</Text>
            </View>
          </Pressable>
          <View style={styles.reviewCard}>
            <Text style={styles.reviewLabel}>ביקורת</Text>
            <Text style={styles.reviewText}>
              {photo.review_text ? photo.review_text : 'אין טקסט ביקורת'}
            </Text>
          </View>
          {avgScores ? (
            <View style={styles.avgCard}>
              <Text style={styles.avgHeader}>ציונים ממוצעים</Text>
              <View style={styles.ratingRow}>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>
                      {Math.round(avgScores.tasty)}%
                    </Text>
                    <Ionicons name="fast-food-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>טעים</Text>
                </View>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>
                      {Math.round(avgScores.fast)}%
                    </Text>
                    <Ionicons name="rocket-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>מהיר</Text>
                </View>
                <View style={styles.ratingItem}>
                  <View style={styles.ratingTopRow}>
                    <Text style={styles.ratingValueInline}>
                      {Math.round(avgScores.filling)}%
                    </Text>
                    <Ionicons name="restaurant-outline" size={18} color="#94A3B8" />
                  </View>
                  <Text style={styles.ratingLabelInline}>משביע</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.results}>
          <Text style={styles.placeholderText}>אין תמונה להצגה</Text>
        </View>
      )}
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.previewBackdrop}>
          <Pressable
            style={styles.previewOverlay}
            onPress={() => setPreviewOpen(false)}
          />
          <Pressable style={styles.previewClose} onPress={() => setPreviewOpen(false)}>
            <Ionicons name="close" size={22} color="#ffffff" />
          </Pressable>
          {photo?.image_url ? (
            <View style={styles.previewImageWrap}>
              <Image
                source={{ uri: photo.image_url }}
                style={styles.previewImage}
                contentFit="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
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
    borderColor: '#E5E7EB',
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  content: {
    flex: 1,
    gap: 16,
  },
  imageWrap: {
    width: '100%',
    height: 320,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageHint: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  imageHintText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  reviewLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
    textAlign: 'right',
  },
  reviewText: {
    fontSize: 14,
    color: '#0f172a',
    textAlign: 'right',
    lineHeight: 20,
  },
  avgCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  avgHeader: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
    marginBottom: 6,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  ratingItem: {
    flex: 1,
    alignItems: 'center',
  },
  ratingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingValueInline: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  ratingLabelInline: {
    marginTop: 2,
    fontSize: 12,
    color: '#94A3B8',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewImageWrap: {
    width: '92%',
    height: '92%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    zIndex: 5,
  },
  results: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafafa',
  },
  placeholderText: {
    color: '#666666',
    fontSize: 14,
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
});
