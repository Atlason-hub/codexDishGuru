import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CachedLogo from './CachedLogo';
import RatingValueRow from './RatingValueRow';
import { theme } from '../lib/theme';
import { useLocale } from '../lib/locale';

const dishActionColor = '#C75D2C';

export type DishCardItem = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  filling_score: number | null;
  created_at: string | null;
  review_text?: string | null;
};

const IMAGE_HEIGHT = 260;

type DishCardProps = {
  items: DishCardItem[];
  favorites?: Record<string, boolean>;
  currentUserId?: string | null;
  avatarUrl?: string | null;
  userAvatars?: Record<string, string>;
  userLabels?: Record<string, string>;
  showReview?: boolean;
  onAvatarPress?: (url: string | null, label: string | null) => void;
  onToggleFavorite?: (id: string) => void;
  onOpenPhoto?: (item: DishCardItem) => void;
  onPreviewImage?: (item: DishCardItem) => void;
  onOpenDish?: (item: DishCardItem) => void;
  onOpenRestaurant?: (item: DishCardItem) => void;
  onOpenCamera?: (item: DishCardItem) => void;
  onEdit?: (item: DishCardItem) => void;
  onDelete?: (item: DishCardItem) => void;
  onOrder?: (item: DishCardItem) => void;
  onReport?: (item: DishCardItem) => void;
};

function DishCard({
  items,
  favorites = {},
  currentUserId,
  avatarUrl,
  userAvatars = {},
  userLabels = {},
  showReview = false,
  onAvatarPress,
  onToggleFavorite,
  onOpenPhoto,
  onPreviewImage,
  onOpenDish,
  onOpenRestaurant,
  onOpenCamera,
  onEdit,
  onDelete,
  onOrder,
  onReport,
}: DishCardProps) {
  const { isRTL, t } = useLocale();
  const [imageWidth, setImageWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const heartScale = useRef(new Animated.Value(1)).current;
  const cameraScale = useRef(new Animated.Value(1)).current;
  const editScale = useRef(new Animated.Value(1)).current;
  const trashScale = useRef(new Animated.Value(1)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  const reportScale = useRef(new Animated.Value(1)).current;
  const currentItem = useMemo(() => items[currentIndex] ?? items[0], [currentIndex, items]);
  const reviewValue = useMemo(() => currentItem?.review_text?.trim() ?? '', [currentItem?.review_text]);
  const shouldShowReview = Boolean(reviewValue);
  const resolvedAvatarUrl = useMemo(
    () =>
      currentItem?.user_id && currentItem.user_id === currentUserId && avatarUrl
        ? avatarUrl
        : currentItem?.user_id
          ? userAvatars[currentItem.user_id] ?? null
          : null,
    [avatarUrl, currentItem?.user_id, currentUserId, userAvatars]
  );
  const avatarLabel = useMemo(
    () => (currentItem?.user_id ? userLabels[currentItem.user_id] ?? null : null),
    [currentItem?.user_id, userLabels]
  );
  const hasRestaurantTarget = Boolean(
    currentItem && (currentItem.restaurant_id || currentItem.restaurant_name)
  );
  const canReport = Boolean(
    currentItem &&
      onReport &&
      (!currentItem.user_id || !currentUserId || currentItem.user_id !== currentUserId)
  );
  const formattedDate = useMemo(
    () => (currentItem?.created_at ? new Date(currentItem.created_at).toLocaleDateString() : ''),
    [currentItem?.created_at]
  );

  const bouncePress = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.92,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.08,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCarouselMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const width = imageWidth || event.nativeEvent.layoutMeasurement.width || 1;
    const rawIndex = event.nativeEvent.contentOffset.x / width;
    const nextIndex = Math.max(0, Math.min(items.length - 1, Math.round(rawIndex)));
    if (nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
    }
  }, [currentIndex, imageWidth, items.length]);

  return (
    <View style={styles.feedCardShadow}>
      <View style={styles.feedCard}>
      <View
        style={styles.feedImageWrap}
        pointerEvents="box-none"
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          if (width && width !== imageWidth) setImageWidth(width);
        }}
      >
        {items.length > 1 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            scrollEnabled
            nestedScrollEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            directionalLockEnabled
            onMomentumScrollEnd={handleCarouselMomentumEnd}
            style={styles.carouselScroll}
          >
            {items.map((imageItem) => (
              <View key={imageItem.id} style={[styles.imageSlide, { width: imageWidth || '100%' }]}>
                <Pressable
                  style={styles.imagePressable}
                  onPress={() => onOpenPhoto?.(imageItem)}
                  onLongPress={() => onPreviewImage?.(imageItem)}
                  delayLongPress={180}
                >
                  {imageItem.image_url ? (
                    <CachedLogo uri={imageItem.image_url} style={styles.feedImage} />
                  ) : (
                    <View style={styles.feedImagePlaceholder} />
                  )}
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            style={styles.imagePressable}
            pointerEvents="box-only"
            onPress={() => currentItem && onOpenPhoto?.(currentItem)}
            onLongPress={() => currentItem && onPreviewImage?.(currentItem)}
            delayLongPress={180}
          >
            {currentItem?.image_url ? (
              <CachedLogo uri={currentItem.image_url} style={styles.feedImage} />
            ) : (
              <View style={styles.feedImagePlaceholder} />
            )}
          </Pressable>
        )}
        <View
          style={[
            styles.cameraTapTarget,
            isRTL ? styles.cameraTapTargetRtl : styles.cameraTapTargetLtr,
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.cameraBadge, { transform: [{ scale: cameraScale }] }]}
            pointerEvents="box-none"
          >
            <Pressable
              style={styles.cameraBadgePressable}
              hitSlop={10}
              pressRetentionOffset={18}
              onPress={() => {
                if (currentItem) {
                  onOpenCamera?.(currentItem);
                  bouncePress(cameraScale);
                }
              }}
            >
              <Ionicons name="camera" size={18} color={dishActionColor} />
            </Pressable>
          </Animated.View>
        </View>
        <View style={styles.imageOverlay} pointerEvents="box-none">
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.0)']}
            style={styles.imageGradient}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.45)']}
            style={styles.imageGradientBottom}
            pointerEvents="none"
          />
          <View
            style={[
              styles.leftButtonStack,
              isRTL ? styles.overlayActionStackRtl : styles.overlayActionStackLtr,
            ]}
            pointerEvents="box-none"
          >
            <Animated.View style={[styles.heartBadge, { transform: [{ scale: heartScale }] }]}>
              <Pressable
                style={styles.badgePressable}
                hitSlop={12}
                onStartShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onPress={() => {
                  if (currentItem?.id) {
                    onToggleFavorite?.(currentItem.id);
                    bouncePress(heartScale);
                  }
                }}
              >
                <Ionicons
                  name={currentItem?.id && favorites[currentItem.id] ? 'heart' : 'heart-outline'}
                  size={18}
                  color={dishActionColor}
                />
              </Pressable>
            </Animated.View>
            {currentItem?.user_id && currentItem.user_id === currentUserId && onEdit ? (
              <Animated.View style={[styles.editBadge, { transform: [{ scale: editScale }] }]}>
                <Pressable
                  style={styles.badgePressable}
                  hitSlop={12}
                  onPress={() => {
                    onEdit(currentItem);
                    bouncePress(editScale);
                  }}
                >
                  <Ionicons name="create-outline" size={18} color={dishActionColor} />
                </Pressable>
              </Animated.View>
            ) : null}
            {currentItem?.user_id && currentItem.user_id === currentUserId ? (
              <Animated.View style={[styles.trashBadge, { transform: [{ scale: trashScale }] }]}>
                <Pressable
                  style={styles.badgePressable}
                  hitSlop={12}
                  onPress={() => {
                    if (currentItem) {
                      onDelete?.(currentItem);
                      bouncePress(trashScale);
                    }
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.white} />
                </Pressable>
              </Animated.View>
            ) : null}
          </View>
          <Text
            style={[
              styles.imageDateText,
              isRTL ? styles.imageDateTextRtl : styles.imageDateTextLtr,
            ]}
          >
            {formattedDate}
          </Text>
          <Animated.View
            style={[
              styles.avatarBadge,
              isRTL ? styles.avatarBadgeRtl : styles.avatarBadgeLtr,
              { transform: [{ scale: avatarScale }] },
            ]}
          >
            <Pressable
              style={styles.badgePressable}
              onPress={() => {
                if (onAvatarPress) {
                  onAvatarPress(resolvedAvatarUrl ?? null, avatarLabel ?? null);
                  bouncePress(avatarScale);
                }
              }}
              disabled={!onAvatarPress}
            >
              {resolvedAvatarUrl ? (
                <CachedLogo uri={resolvedAvatarUrl} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={16} color={theme.colors.textMuted} />
              )}
            </Pressable>
          </Animated.View>
          {canReport ? (
            <Animated.View
              style={[
                styles.reportBadge,
                isRTL ? styles.reportBadgeRtl : styles.reportBadgeLtr,
                { transform: [{ scale: reportScale }] },
              ]}
            >
              <Pressable
                style={styles.badgePressable}
                onPress={() => {
                  if (currentItem) {
                    onReport?.(currentItem);
                    bouncePress(reportScale);
                  }
                }}
              >
                <Ionicons name="flag-outline" size={16} color={dishActionColor} />
              </Pressable>
            </Animated.View>
          ) : null}
          <View
            style={[
              styles.imageTextBlock,
              isRTL ? styles.imageTextBlockRtl : styles.imageTextBlockLtr,
            ]}
          >
            <Pressable onPress={() => currentItem && onOpenDish?.(currentItem)}>
              <Text
                style={[
                  styles.imageDishText,
                  {
                    textAlign: isRTL ? 'right' : 'left',
                    writingDirection: isRTL ? 'rtl' : 'ltr',
                  },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {currentItem?.dish_name ?? 'מנה'}
              </Text>
            </Pressable>
            <Pressable
              hitSlop={10}
              disabled={!hasRestaurantTarget || !onOpenRestaurant}
              onPress={() => currentItem && onOpenRestaurant?.(currentItem)}
              style={({ pressed }) => [
                styles.restaurantLinkPressable,
                pressed && hasRestaurantTarget && styles.restaurantLinkPressablePressed,
              ]}
            >
              <Text
                style={[
                  styles.imageRestaurantText,
                  {
                    textAlign: isRTL ? 'right' : 'left',
                    writingDirection: isRTL ? 'rtl' : 'ltr',
                  },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {currentItem?.restaurant_name ??
                  (currentItem?.restaurant_id ? `מסעדה ${currentItem.restaurant_id}` : 'מסעדה')}
              </Text>
            </Pressable>
          </View>
          {items.length > 1 ? (
            <View style={styles.carouselDots} pointerEvents="none">
              {items.map((_, idx) => (
                <View
                  key={`${items[0]?.id ?? 'item'}-dot-${idx}`}
                  style={[
                    styles.carouselDot,
                    idx === currentIndex && styles.carouselDotActive,
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {shouldShowReview ? (
        <View style={styles.reviewCard}>
          <View
            style={[
              styles.reviewTail,
              isRTL ? styles.reviewTailRtl : styles.reviewTailLtr,
            ]}
          />
          <Text style={[styles.reviewText, !isRTL && styles.reviewTextLtr]}>{reviewValue}</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.ratingRow,
          Platform.OS === 'ios' && styles.ratingRowIos,
          !isRTL && styles.ratingRowLtr,
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.orderButton,
            !isRTL && styles.orderButtonLtr,
            pressed && styles.orderButtonPressed,
          ]}
          onPress={() => {
            if (currentItem) {
              onOrder?.(currentItem);
            }
          }}
        >
          <Ionicons name="cart-outline" size={18} color={theme.colors.white} />
          <Text style={styles.orderButtonText}>{t('orderAction')}</Text>
        </Pressable>
        <View
          style={[
            styles.ratingGroup,
            !isRTL && styles.ratingGroupLtr,
          ]}
        >
          <View style={[styles.ratingItem, !isRTL && styles.ratingItemLtr]}>
            <RatingValueRow
              label={t('ratingTasty')}
              score={currentItem?.tasty_score}
              iconSize={isRTL ? 30 : 27}
              rowStyle={[styles.ratingInlineRow, !isRTL && styles.ratingInlineRowLtr]}
              labelStyle={[styles.ratingLabelInline, !isRTL && styles.ratingLabelInlineLtr]}
              iconsWrapStyle={[
                styles.ratingStarWrap,
                !isRTL && styles.ratingStarWrapLtr,
              ]}
            />
          </View>
          <View style={[styles.ratingItem, !isRTL && styles.ratingItemLtr]}>
            <RatingValueRow
              label={t('ratingSize')}
              score={currentItem?.filling_score}
              iconSize={isRTL ? 30 : 27}
              rowStyle={[styles.ratingInlineRow, !isRTL && styles.ratingInlineRowLtr]}
              labelStyle={[styles.ratingLabelInline, !isRTL && styles.ratingLabelInlineLtr]}
              iconsWrapStyle={[
                styles.ratingStarWrap,
                !isRTL && styles.ratingStarWrapLtr,
              ]}
            />
          </View>
        </View>
      </View>
      </View>
    </View>
  );
}

const itemsEqual = (a: DishCardItem[], b: DishCardItem[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.image_url !== right.image_url ||
      left.dish_name !== right.dish_name ||
      left.restaurant_name !== right.restaurant_name ||
      left.tasty_score !== right.tasty_score ||
      left.filling_score !== right.filling_score ||
      left.created_at !== right.created_at ||
      left.review_text !== right.review_text ||
      left.user_id !== right.user_id ||
      left.dish_id !== right.dish_id ||
      left.restaurant_id !== right.restaurant_id
    ) {
      return false;
    }
  }
  return true;
};

const favoritesEqual = (
  a: Record<string, boolean> | undefined,
  b: Record<string, boolean> | undefined,
  items: DishCardItem[]
) => {
  if (a === b) return true;
  for (const item of items) {
    const id = item.id;
    if (Boolean(a?.[id]) !== Boolean(b?.[id])) return false;
  }
  return true;
};

const mapsEqualForUsers = (
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
  items: DishCardItem[]
) => {
  if (a === b) return true;
  const ids = new Set(items.map((item) => item.user_id).filter(Boolean) as string[]);
  for (const id of ids) {
    if ((a?.[id] ?? null) !== (b?.[id] ?? null)) return false;
  }
  return true;
};

export default React.memo(DishCard, (prev, next) => {
  if (!itemsEqual(prev.items, next.items)) return false;
  if (!favoritesEqual(prev.favorites, next.favorites, next.items)) return false;
  if (prev.currentUserId !== next.currentUserId) return false;
  if (prev.avatarUrl !== next.avatarUrl) return false;
  if (prev.showReview !== next.showReview) return false;
  if (!mapsEqualForUsers(prev.userAvatars, next.userAvatars, next.items)) return false;
  if (!mapsEqualForUsers(prev.userLabels, next.userLabels, next.items)) return false;
  if (prev.onAvatarPress !== next.onAvatarPress) return false;
  if (prev.onToggleFavorite !== next.onToggleFavorite) return false;
  if (prev.onOpenPhoto !== next.onOpenPhoto) return false;
  if (prev.onPreviewImage !== next.onPreviewImage) return false;
  if (prev.onOpenDish !== next.onOpenDish) return false;
  if (prev.onOpenRestaurant !== next.onOpenRestaurant) return false;
  if (prev.onOpenCamera !== next.onOpenCamera) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onOrder !== next.onOrder) return false;
  if (prev.onReport !== next.onReport) return false;
  return true;
});

const styles = StyleSheet.create({
  feedCardShadow: {
    position: 'relative',
    borderRadius: 16,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
    marginHorizontal: 2,
  },
  feedCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(50, 34, 20, 0.045)',
  },
  feedImageWrap: {
    position: 'relative',
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    margin: 0,
  },
  imageGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 2,
  },
  imageGradientBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    zIndex: 2,
  },
  feedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  feedImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.cardAlt,
  },
  imagePressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  imageSlide: {
    height: '100%',
  },
  carouselScroll: {
    flex: 1,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    elevation: 12,
  },
  leftButtonStack: {
    position: 'absolute',
    top: 54,
    width: 36,
    height: 220,
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 6,
  },
  cameraTapTarget: {
    position: 'absolute',
    top: 44,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 11,
    elevation: 30,
  },
  cameraTapTargetRtl: {
    left: 0,
  },
  cameraTapTargetLtr: {
    right: 0,
  },
  overlayActionStackRtl: {
    left: 12,
  },
  overlayActionStackLtr: {
    right: 12,
  },
  cameraBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: dishActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 20,
  },
  badgePressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  cameraBadgePressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  heartBadge: {
    position: 'absolute',
    top: 54,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: dishActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 20,
  },
  editBadge: {
    position: 'absolute',
    top: 108,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: dishActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 20,
  },
  imageDateText: {
    position: 'absolute',
    top: 10,
    fontSize: 9,
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: theme.colors.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 16,
    textAlign: 'left',
    zIndex: 4,
  },
  imageDateTextRtl: {
    left: 12,
  },
  imageDateTextLtr: {
    right: 12,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 7,
    borderWidth: 2,
    borderColor: theme.colors.accentSoft,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarBadgeRtl: {
    right: 16,
  },
  avatarBadgeLtr: {
    left: 16,
  },
  reportBadge: {
    position: 'absolute',
    bottom: 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: dishActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  reportBadgeRtl: {
    right: 16,
  },
  reportBadgeLtr: {
    left: 16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  trashBadge: {
    position: 'absolute',
    top: 162,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dishActionColor,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  imageTextBlock: {
    position: 'absolute',
    top: 16,
    left: 12,
    zIndex: 6,
  },
  imageTextBlockRtl: {
    right: 12,
    alignItems: 'flex-end',
    paddingLeft: 84,
  },
  imageTextBlockLtr: {
    right: 12,
    alignItems: 'flex-start',
    paddingRight: 84,
  },
  imageDishText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: theme.typography.bold,
    lineHeight: 26,
  },
  imageRestaurantText: {
    color: '#f7f0e8',
    fontSize: 12,
    marginTop: 2,
    fontFamily: theme.typography.semibold,
  },
  restaurantLinkPressable: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  restaurantLinkPressablePressed: {
    opacity: 0.75,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
    alignSelf: 'flex-end',
    width: '100%',
    paddingRight: Platform.OS === 'ios' ? 6 : 12,
    paddingLeft: Platform.OS === 'ios' ? 18 : 12,
    alignItems: 'center',
  },
  ratingRowIos: {
    width: '100%',
  },
  ratingRowLtr: {
    flexDirection: 'row-reverse',
  },
  ratingGroup: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  ratingGroupLtr: {
    alignItems: 'flex-start',
    paddingLeft: 0,
    paddingRight: 0,
  },
  orderButton: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    backgroundColor: dishActionColor,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  orderButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontFamily: theme.typography.bold,
  },
  orderButtonLtr: {
    marginRight: 0,
    marginLeft: 24,
  },
  orderButtonPressed: {
    opacity: 0.9,
  },
  reviewCard: {
    marginTop: 10,
    marginHorizontal: 8,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(250, 244, 237, 0.84)',
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  reviewTail: {
    position: 'absolute',
    top: -5,
    width: 12,
    height: 12,
    backgroundColor: 'rgba(250, 244, 237, 0.84)',
    transform: [{ rotate: '45deg' }],
  },
  reviewTailRtl: {
    right: 26,
  },
  reviewTailLtr: {
    left: 26,
  },
  reviewLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'right',
    marginBottom: 4,
  },
  reviewText: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'right',
    fontFamily: theme.typography.regular,
    lineHeight: 21,
  },
  reviewTextLtr: {
    textAlign: 'left',
  },
  ratingItem: {
    flex: 0,
    alignItems: 'flex-end',
    marginRight: 0,
    alignSelf: 'flex-end',
  },
  ratingItemLtr: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  ratingIcon: {
    marginBottom: 1,
  },
  ratingStarWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  ratingStarWrapLtr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: Platform.OS === 'ios' ? 16 : 2,
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: Platform.OS === 'ios' ? 8 : 64,
  },
  ratingInlineRowLtr: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
    paddingRight: 0,
    paddingLeft: 6,
  },
  ratingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    alignSelf: 'flex-end',
    paddingRight: Platform.OS === 'ios' ? 0 : 8,
    minWidth: Platform.OS === 'ios' ? 44 : 60,
    textAlign: 'right',
    lineHeight: 30,
    fontFamily: theme.typography.semibold,
  },
  ratingLabelInlineLtr: {
    alignSelf: 'center',
    paddingRight: 0,
    paddingLeft: 0,
    marginLeft: 6,
    minWidth: 42,
    textAlign: 'left',
  },
  carouselDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    zIndex: 6,
  },
  carouselDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  carouselDotActive: {
    backgroundColor: '#ffffff',
  },
});
