import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
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

type Rect = { x: number; y: number; width: number; height: number };

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
  onOpenDish?: (item: DishCardItem) => void;
  onOpenRestaurant?: (item: DishCardItem) => void;
  onOpenCamera?: (item: DishCardItem) => void;
  onEdit?: (item: DishCardItem) => void;
  onDelete?: (item: DishCardItem) => void;
  onOrder?: (item: DishCardItem) => void;
};

const isInsideLayout = (layout: Rect | undefined, x: number, y: number) => {
  if (!layout) return false;
  return x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height;
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
  onOpenDish,
  onOpenRestaurant,
  onOpenCamera,
  onEdit,
  onDelete,
  onOrder,
}: DishCardProps) {
  const [imageWidth, setImageWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const ratingAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(1)).current;
  const cameraScale = useRef(new Animated.Value(1)).current;
  const editScale = useRef(new Animated.Value(1)).current;
  const trashScale = useRef(new Animated.Value(1)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  const orderScale = useRef(new Animated.Value(1)).current;
  const [buttonLayouts, setButtonLayouts] = useState<{
    camera?: Rect;
    heart?: Rect;
    order?: Rect;
    avatar?: Rect;
    edit?: Rect;
    trash?: Rect;
  }>({});

  const currentItem = items[currentIndex] ?? items[0];
  const reviewValue = currentItem?.review_text?.trim();
  const shouldShowReview = Boolean(reviewValue);
  const resolvedAvatarUrl =
    currentItem?.user_id && currentItem.user_id === currentUserId && avatarUrl
      ? avatarUrl
      : currentItem?.user_id
        ? userAvatars[currentItem.user_id] ?? null
        : null;
  const avatarLabel = currentItem?.user_id ? userLabels[currentItem.user_id] ?? null : null;

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

  useEffect(() => {
    ratingAnim.setValue(0);
    Animated.timing(ratingAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentItem?.id, ratingAnim]);

  useEffect(() => {
    Animated.timing(dotAnim, {
      toValue: currentIndex,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentIndex, dotAnim]);

  const panResponder = useMemo(
    () =>
      items.length > 1
        ? PanResponder.create({
            onStartShouldSetPanResponder: (evt) => {
              const { locationX, locationY } = evt.nativeEvent;
              if (
                isInsideLayout(buttonLayouts.camera, locationX, locationY) ||
                isInsideLayout(buttonLayouts.heart, locationX, locationY) ||
                isInsideLayout(buttonLayouts.order, locationX, locationY) ||
                isInsideLayout(buttonLayouts.avatar, locationX, locationY) ||
                isInsideLayout(buttonLayouts.edit, locationX, locationY) ||
                isInsideLayout(buttonLayouts.trash, locationX, locationY)
              ) {
                return false;
              }
              return true;
            },
            onMoveShouldSetPanResponder: (evt, gesture) => {
              const { locationX, locationY } = evt.nativeEvent;
              if (
                isInsideLayout(buttonLayouts.camera, locationX, locationY) ||
                isInsideLayout(buttonLayouts.heart, locationX, locationY) ||
                isInsideLayout(buttonLayouts.order, locationX, locationY) ||
                isInsideLayout(buttonLayouts.avatar, locationX, locationY) ||
                isInsideLayout(buttonLayouts.edit, locationX, locationY) ||
                isInsideLayout(buttonLayouts.trash, locationX, locationY)
              ) {
                return false;
              }
              return Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 8;
            },
            onPanResponderRelease: (_evt, gesture) => {
              const width = imageWidth || 1;
              const current = currentIndex;
              let next = current;
              if (gesture.dx < -30 && current < items.length - 1) {
                next = current + 1;
              } else if (gesture.dx > 30 && current > 0) {
                next = current - 1;
              }
              if (next !== current) {
                setCurrentIndex(next);
                scrollRef.current?.scrollTo({ x: next * width, animated: true });
              }
              if (Math.abs(gesture.dx) < 8 && currentItem) {
                onOpenPhoto?.(currentItem);
              }
            },
          })
        : null,
    [buttonLayouts, currentIndex, imageWidth, items.length, currentItem, onOpenPhoto]
  );

  return (
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
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            scrollEnabled={false}
            pointerEvents="none"
            contentOffset={{ x: currentIndex * (imageWidth || 0), y: 0 }}
            style={styles.carouselScroll}
          >
            {items.map((imageItem) => (
              <View key={imageItem.id} style={[styles.imageSlide, { width: imageWidth || '100%' }]}>
                {imageItem.image_url ? (
                  <CachedLogo uri={imageItem.image_url} style={styles.feedImage} />
                ) : (
                  <View style={styles.feedImagePlaceholder} />
                )}
              </View>
            ))}
          </ScrollView>
        ) : (
          <Pressable
            style={styles.imagePressable}
            pointerEvents="box-only"
            onPress={() => currentItem && onOpenPhoto?.(currentItem)}
          >
            {currentItem?.image_url ? (
              <CachedLogo uri={currentItem.image_url} style={styles.feedImage} />
            ) : (
              <View style={styles.feedImagePlaceholder} />
            )}
          </Pressable>
        )}
        {items.length > 1 ? (
          <View
            style={styles.carouselSwipeZone}
            pointerEvents="auto"
            {...(panResponder ? panResponder.panHandlers : {})}
          />
        ) : null}
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
          <View style={styles.leftButtonStack} pointerEvents="box-none">
            <Animated.View style={[styles.cameraBadge, { transform: [{ scale: cameraScale }] }]}>
              <Pressable
                style={styles.badgePressable}
                hitSlop={8}
                onStartShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onLayout={(event) => {
                  const { x, y, width, height } = event.nativeEvent.layout;
                  setButtonLayouts((prev) => ({ ...prev, camera: { x, y, width, height } }));
                }}
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
            <Animated.View style={[styles.heartBadge, { transform: [{ scale: heartScale }] }]}>
              <Pressable
                style={styles.badgePressable}
                hitSlop={8}
                onStartShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onLayout={(event) => {
                  const { x, y, width, height } = event.nativeEvent.layout;
                  setButtonLayouts((prev) => ({ ...prev, heart: { x, y, width, height } }));
                }}
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
                  hitSlop={8}
                  onLayout={(event) => {
                    const { x, y, width, height } = event.nativeEvent.layout;
                    setButtonLayouts((prev) => ({ ...prev, edit: { x, y, width, height } }));
                  }}
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
                  hitSlop={8}
                  onLayout={(event) => {
                    const { x, y, width, height } = event.nativeEvent.layout;
                    setButtonLayouts((prev) => ({ ...prev, trash: { x, y, width, height } }));
                  }}
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
          <Text style={styles.imageDateText}>
            {currentItem?.created_at ? new Date(currentItem.created_at).toLocaleDateString() : ''}
          </Text>
          <Animated.View style={[styles.avatarBadge, { transform: [{ scale: avatarScale }] }]}>
            <Pressable
              style={styles.badgePressable}
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setButtonLayouts((prev) => ({ ...prev, avatar: { x, y, width, height } }));
              }}
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
          <View style={styles.imageTextBlock}>
            <Pressable onPress={() => currentItem && onOpenDish?.(currentItem)}>
              <Text style={styles.imageDishText} numberOfLines={2} ellipsizeMode="tail">
                {currentItem?.dish_name ?? 'מנה'}
              </Text>
            </Pressable>
            <Pressable onPress={() => currentItem && onOpenRestaurant?.(currentItem)}>
              <Text style={styles.imageRestaurantText} numberOfLines={1} ellipsizeMode="tail">
                {currentItem?.restaurant_name ??
                  (currentItem?.restaurant_id ? `מסעדה ${currentItem.restaurant_id}` : 'מסעדה')}
              </Text>
            </Pressable>
          </View>
          {items.length > 1 ? (
            <View style={styles.carouselDots} pointerEvents="none">
              {items.map((_, idx) => (
                <Animated.View
                  key={`${items[0]?.id ?? 'item'}-dot-${idx}`}
                  style={[
                    styles.carouselDot,
                    idx === currentIndex && styles.carouselDotActive,
                    {
                      transform: [
                        {
                          scale: dotAnim.interpolate({
                            inputRange: [idx - 1, idx, idx + 1],
                            outputRange: [1, 1.15, 1],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {shouldShowReview ? (
        <View style={styles.reviewCard}>
          <Text style={styles.reviewText}>{reviewValue}</Text>
        </View>
      ) : null}
      <View style={[styles.ratingRow, Platform.OS === 'ios' && styles.ratingRowIos]}>
        <Animated.View style={{ transform: [{ scale: orderScale }] }}>
          <Pressable
            style={styles.orderButton}
            onLayout={(event) => {
              const { x, y, width, height } = event.nativeEvent.layout;
              setButtonLayouts((prev) => ({ ...prev, order: { x, y, width, height } }));
            }}
            onPressIn={() =>
              Animated.timing(orderScale, {
                toValue: 0.96,
                duration: 80,
                useNativeDriver: true,
              }).start()
            }
            onPressOut={() =>
              Animated.timing(orderScale, {
                toValue: 1,
                duration: 120,
                useNativeDriver: true,
              }).start()
            }
            onPress={() => {
              if (currentItem) {
                onOrder?.(currentItem);
              }
            }}
          >
            <Ionicons name="cart-outline" size={18} color={theme.colors.white} />
            <Text style={styles.orderButtonText}>הזמן</Text>
          </Pressable>
        </Animated.View>
        <View style={styles.ratingGroup}>
          <View style={styles.ratingItem}>
            <RatingValueRow
              label="טעים"
              score={currentItem?.tasty_score}
              iconSize={30}
              rowStyle={styles.ratingInlineRow}
              labelStyle={styles.ratingLabelInline}
              iconsWrapStyle={[
                styles.ratingStarWrap,
                {
                  opacity: ratingAnim,
                  transform: [
                    {
                      translateY: ratingAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
          <View style={styles.ratingItem}>
            <RatingValueRow
              label="משביע"
              score={currentItem?.filling_score}
              iconSize={30}
              rowStyle={styles.ratingInlineRow}
              labelStyle={styles.ratingLabelInline}
              iconsWrapStyle={[
                styles.ratingStarWrap,
                {
                  opacity: ratingAnim,
                  transform: [
                    {
                      translateY: ratingAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
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
  if (prev.onOpenDish !== next.onOpenDish) return false;
  if (prev.onOpenRestaurant !== next.onOpenRestaurant) return false;
  if (prev.onOpenCamera !== next.onOpenCamera) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onOrder !== next.onOrder) return false;
  return true;
});

const styles = StyleSheet.create({
  feedCard: {
    position: 'relative',
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  feedImageWrap: {
    position: 'relative',
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: theme.colors.card,
    borderRadius: 22,
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
  carouselSwipeZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 4,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    elevation: 12,
  },
  leftButtonStack: {
    position: 'absolute',
    top: 54,
    left: 12,
    width: 36,
    height: 220,
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 6,
  },
  cameraBadge: {
    position: 'absolute',
    top: 0,
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
  badgePressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
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
    left: 12,
    fontSize: 9,
    color: theme.colors.text,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: theme.colors.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 16,
    textAlign: 'left',
    zIndex: 4,
  },
  avatarBadge: {
    position: 'absolute',
    right: 16,
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
    right: 12,
    left: 12,
    alignItems: 'flex-end',
    paddingLeft: 84,
    zIndex: 6,
  },
  imageDishText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 26,
  },
  imageRestaurantText: {
    color: '#f7f0e8',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
    writingDirection: 'rtl',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
    alignSelf: 'flex-end',
    width: '100%',
    paddingRight: Platform.OS === 'ios' ? 18 : 12,
    paddingLeft: Platform.OS === 'ios' ? 18 : 12,
    alignItems: 'center',
  },
  ratingRowIos: {
    width: '100%',
  },
  ratingGroup: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
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
    fontWeight: '700',
  },
  reviewCard: {
    marginTop: 10,
    marginHorizontal: 12,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFDFB',
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
  },
  ratingItem: {
    flex: 0,
    alignItems: 'flex-end',
    marginRight: 0,
    alignSelf: 'flex-end',
  },
  ratingIcon: {
    marginBottom: 1,
  },
  ratingStarWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  ratingInlineRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 64,
  },
  ratingLabelInline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    alignSelf: 'flex-end',
    paddingRight: 8,
    minWidth: 60,
    textAlign: 'right',
    lineHeight: 30,
  },
  carouselDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    zIndex: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  carouselDotActive: {
    backgroundColor: '#ffffff',
  },
});
