import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CachedLogo from '../components/CachedLogo';
import { supabase } from '../lib/supabase';
import { theme } from '../lib/theme';
import { scoreToStars, starsToScore } from '../lib/ratings';
import EmojiRatingInput from '../components/EmojiRatingInput';
import { showAppAlert } from '../lib/appDialog';

type DishAssociation = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  dish_name: string | null;
  restaurant_id: number | null;
  restaurant_name: string | null;
  review_text: string | null;
  tasty_score: number | null;
  filling_score: number | null;
  image_url: string | null;
  image_path: string | null;
};

export default function EditDishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const associationId = typeof params.id === 'string' ? params.id : '';
  const photoUriParam = typeof params.photoUri === 'string' ? params.photoUri : '';
  const photoBase64Param = typeof params.photoBase64 === 'string' ? params.photoBase64 : '';
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '';
  const returnScroll = typeof params.scrollY === 'string' ? params.scrollY : '';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [dish, setDish] = useState<DishAssociation | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [tastyScore, setTastyScore] = useState(2.5);
  const [fillingScore, setFillingScore] = useState(2.5);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const decodedPhotoUri = useMemo(() => {
    if (!photoUriParam) return '';
    try {
      return decodeURIComponent(photoUriParam);
    } catch {
      return photoUriParam;
    }
  }, [photoUriParam]);

  useEffect(() => {
    if (decodedPhotoUri) setPhotoUri(decodedPhotoUri);
    if (photoBase64Param) setPhotoBase64(photoBase64Param);
  }, [decodedPhotoUri, photoBase64Param]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const userId = data.session?.user?.id ?? null;
      setCurrentUserId(userId);
      if (!associationId) return;
      try {
        setLoading(true);
        const { data: row, error } = await supabase
          .from('dish_associations')
          .select(
            'id, user_id, dish_id, dish_name, restaurant_id, restaurant_name, review_text, tasty_score, filling_score, image_url, image_path'
          )
          .eq('id', associationId)
          .single();
        if (error) throw error;
        if (!mounted) return;
        const dataRow = row as DishAssociation;
        setDish(dataRow);
        setReviewText(dataRow.review_text ?? '');
        setTastyScore(scoreToStars(dataRow.tasty_score ?? 50));
        setFillingScore(scoreToStars(dataRow.filling_score ?? 50));
        if (!decodedPhotoUri) {
          setPhotoUri(dataRow.image_url ?? null);
        }
      } catch {
        showAppAlert('שגיאה', 'לא ניתן לטעון את המנה.');
      } finally {
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [associationId, decodedPhotoUri]);

  const handleSave = async () => {
    if (!dish || !associationId) return;
    if (!currentUserId || dish.user_id !== currentUserId) {
      showAppAlert('אין הרשאה', 'אפשר לערוך רק מנות שהעלית.');
      return;
    }
    try {
      setSaving(true);
      let imageUrl = dish.image_url;
      let imagePath = dish.image_path;
      if (photoBase64 && photoUri) {
        const ext = photoUri.split('.').pop()?.split('?')[0] ?? 'jpg';
        const filePath = `${currentUserId}/${Date.now()}.${ext}`;
        const base64ToArrayBuffer = (b64: string) => {
          const binary = globalThis.atob
            ? globalThis.atob(b64)
            : Buffer.from(b64, 'base64').toString('binary');
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
          return bytes.buffer;
        };
        const bytes = base64ToArrayBuffer(photoBase64);
        const upload = await supabase.storage.from('dish-images').upload(filePath, bytes, {
          contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          upsert: true,
        });
        if (upload.error) throw upload.error;
        const { data: publicData } = supabase.storage.from('dish-images').getPublicUrl(filePath);
        imageUrl = publicData?.publicUrl ?? imageUrl;
        imagePath = filePath;
      }
      const { data: updated, error } = await supabase
        .from('dish_associations')
        .update({
          review_text: reviewText,
          tasty_score: starsToScore(tastyScore),
          filling_score: starsToScore(fillingScore),
          image_url: imageUrl,
          image_path: imagePath,
        })
        .eq('id', associationId)
        .eq('user_id', currentUserId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!updated?.id) {
        throw new Error('לא נמצאה מנה לעדכון.');
      }
      const refreshToken = Date.now().toString();
      if (returnTo === 'main') {
        router.replace({ pathname: '/', params: { refresh: refreshToken, scrollY: returnScroll } });
        return;
      }
      if (returnTo === 'my') {
        router.replace({ pathname: '/my-dishes', params: { refresh: refreshToken } });
        return;
      }
      if (dish.dish_id || dish.dish_name || dish.restaurant_id || dish.restaurant_name) {
        router.replace({
          pathname: '/dish',
          params: {
            dishId: dish.dish_id !== null ? String(dish.dish_id) : '',
            dishName: dish.dish_name ?? '',
            restaurantId: dish.restaurant_id ? String(dish.restaurant_id) : '',
            restaurantName: dish.restaurant_name ?? '',
            refresh: refreshToken,
          },
        });
      } else {
        router.replace({ pathname: '/', params: { refresh: refreshToken } });
      }
    } catch {
      showAppAlert('שמירה נכשלה', 'לא הצלחנו לשמור את השינויים.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!dish) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.placeholderText}>המנה לא נמצאה.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow} pointerEvents="box-none">
        <View style={styles.backButtonWrap}>
          <Pressable
            style={styles.backButtonHit}
            onPress={() => {
            if (returnTo === 'main') {
              router.replace({ pathname: '/', params: { scrollY: returnScroll } });
              return;
            }
            if (returnTo === 'my') {
              router.replace('/my-dishes');
              return;
            }
            if (dish?.dish_id || dish?.dish_name || dish?.restaurant_id || dish?.restaurant_name) {
              router.replace({
                pathname: '/dish',
                params: {
                  dishId: dish?.dish_id !== null ? String(dish?.dish_id) : '',
                  dishName: dish?.dish_name ?? '',
                  restaurantId: dish?.restaurant_id ? String(dish?.restaurant_id) : '',
                  restaurantName: dish?.restaurant_name ?? '',
                },
              });
            } else {
              router.replace('/');
            }
          }}
          />
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (returnTo === 'main') {
                router.replace({ pathname: '/', params: { scrollY: returnScroll } });
                return;
              }
              if (returnTo === 'my') {
                router.replace('/my-dishes');
                return;
              }
              if (dish?.dish_id || dish?.dish_name || dish?.restaurant_id || dish?.restaurant_name) {
                router.replace({
                  pathname: '/dish',
                  params: {
                    dishId: dish?.dish_id !== null ? String(dish?.dish_id) : '',
                    dishName: dish?.dish_name ?? '',
                    restaurantId: dish?.restaurant_id ? String(dish?.restaurant_id) : '',
                    restaurantName: dish?.restaurant_name ?? '',
                  },
                });
              } else {
                router.replace('/');
              }
            }}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.ink} />
          </Pressable>
        </View>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>עריכת מנה</Text>
          <Text style={styles.headerSubtitle}>
            {dish.dish_name ?? ''} {dish.restaurant_name ? `| ${dish.restaurant_name}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.body} pointerEvents="box-none">
        <View style={styles.photoPressable}>
          {photoUri ? (
            <CachedLogo uri={photoUri} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={24} color={theme.colors.accent} />
              <Text style={styles.photoPlaceholderText}>צלם מחדש</Text>
            </View>
          )}
          <Pressable
            style={styles.photoOverlay}
            onPress={() =>
              router.push({
                pathname: '/camera',
                params: { editId: associationId, returnTo, scrollY: returnScroll },
              })
            }
          >
            <Ionicons name="camera" size={18} color={theme.colors.white} />
            <Text style={styles.photoOverlayText}>צלם מחדש</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          placeholder="כתוב דעתך על המנה"
          placeholderTextColor="#9CA3AF"
          value={reviewText}
          onChangeText={setReviewText}
          multiline
          textAlign="right"
        />

        <View style={styles.sliderRow}>
          <View style={styles.sliderLabelRow}>
            <Text style={styles.sliderText}>טעים</Text>
          </View>
          <View style={styles.starInputWrap}>
            <EmojiRatingInput value={tastyScore} onChange={setTastyScore} size={44} />
          </View>
        </View>
        <View style={styles.sliderRow}>
          <View style={styles.sliderLabelRow}>
            <Text style={styles.sliderText}>משביע</Text>
          </View>
          <View style={styles.starInputWrap}>
            <EmojiRatingInput value={fillingScore} onChange={setFillingScore} size={44} />
          </View>
        </View>

        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
          hitSlop={8}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Text style={styles.saveButtonText}>שמור</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  headerRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    zIndex: 10,
    elevation: 10,
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
    zIndex: 2,
  },
  backButtonWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonHit: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    zIndex: 1,
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
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 72,
    gap: 12,
  },
  photoPressable: {
    width: 260,
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: 4,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardAlt,
    gap: 6,
  },
  photoPlaceholderText: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoOverlayText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
    minHeight: 90,
  },
  sliderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    justifyContent: 'flex-end',
    width: '100%',
    paddingRight: 20,
  },
  starInputWrap: {
    flex: 0,
    alignItems: 'flex-end',
    marginRight: 0,
  },
  sliderLabel: {
    width: 90,
    alignItems: 'flex-end',
  },
  sliderLabelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: 110,
    justifyContent: 'flex-end',
    marginLeft: 6,
    paddingRight: 36,
    height: 44,
  },
  sliderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    alignSelf: 'flex-end',
    lineHeight: 44,
  },
  saveButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    zIndex: 10,
    marginTop: 24,
  },
  saveButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
});
