import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CachedLogo from './CachedLogo';
import { theme } from '../lib/theme';

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
};

const isInsideLayout = (layout: Rect | undefined, x: number, y: number) => {
  if (!layout) return false;
  return x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height;
};

export default function DishCard({
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
}: DishCardProps) {
  const [imageWidth, setImageWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);
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
          <View style={styles.leftButtonStack} pointerEvents="box-none">
            <Pressable
              style={styles.cameraBadge}
              hitSlop={8}
              onStartShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setButtonLayouts((prev) => ({ ...prev, camera: { x, y, width, height } }));
              }}
              onPress={() => currentItem && onOpenCamera?.(currentItem)}
            >
              <Ionicons name="camera" size={18} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable
              style={styles.heartBadge}
              hitSlop={8}
              onStartShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setButtonLayouts((prev) => ({ ...prev, heart: { x, y, width, height } }));
              }}
              onPress={() => currentItem?.id && onToggleFavorite?.(currentItem.id)}
            >
              <Ionicons
                name={currentItem?.id && favorites[currentItem.id] ? 'heart' : 'heart-outline'}
                size={18}
                color={
                  currentItem?.id && favorites[currentItem.id]
                    ? theme.colors.accent
                    : theme.colors.textMuted
                }
              />
            </Pressable>
            {currentItem?.user_id && currentItem.user_id === currentUserId && onEdit ? (
              <Pressable
                style={styles.editBadge}
                hitSlop={8}
                onLayout={(event) => {
                  const { x, y, width, height } = event.nativeEvent.layout;
                  setButtonLayouts((prev) => ({ ...prev, edit: { x, y, width, height } }));
                }}
                onPress={() => onEdit(currentItem)}
              >
                <Ionicons name="create-outline" size={18} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.imageDateText}>
            {currentItem?.created_at ? new Date(currentItem.created_at).toLocaleDateString() : ''}
          </Text>
          <Pressable
            style={styles.avatarBadge}
            onLayout={(event) => {
              const { x, y, width, height } = event.nativeEvent.layout;
              setButtonLayouts((prev) => ({ ...prev, avatar: { x, y, width, height } }));
            }}
            onPress={() => onAvatarPress?.(resolvedAvatarUrl ?? null, avatarLabel ?? null)}
            disabled={!onAvatarPress}
          >
            {resolvedAvatarUrl ? (
              <CachedLogo uri={resolvedAvatarUrl} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={16} color={theme.colors.textMuted} />
            )}
          </Pressable>
          {currentItem?.user_id && currentItem.user_id === currentUserId ? (
            <Pressable
              style={styles.trashBadge}
              hitSlop={8}
              onLayout={(event) => {
                const { x, y, width, height } = event.nativeEvent.layout;
                setButtonLayouts((prev) => ({ ...prev, trash: { x, y, width, height } }));
              }}
              onPress={() => currentItem && onDelete?.(currentItem)}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.white} />
            </Pressable>
          ) : null}
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
                <View
                  key={`${items[0]?.id ?? 'item'}-dot-${idx}`}
                  style={[styles.carouselDot, idx === currentIndex && styles.carouselDotActive]}
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
      <View style={styles.ratingRow}>
        <View style={styles.ratingItem}>
          <View style={styles.ratingTopRow}>
            <Text style={styles.ratingValueInline}>{currentItem?.filling_score ?? 0}%</Text>
            <Ionicons
              name="restaurant-outline"
              size={18}
              color={theme.colors.textMuted}
            />
          </View>
          <Text style={styles.ratingLabelInline}>משביע</Text>
        </View>
        <View style={styles.ratingItem}>
          <View style={styles.ratingTopRow}>
            <Text style={styles.ratingValueInline}>{currentItem?.tasty_score ?? 0}%</Text>
            <Ionicons name="fast-food-outline" size={18} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.ratingLabelInline}>טעים</Text>
        </View>
        <Pressable
          style={styles.orderButton}
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            setButtonLayouts((prev) => ({ ...prev, order: { x, y, width, height } }));
          }}
        >
          <Ionicons name="cart-outline" size={18} color={theme.colors.white} />
          <Text style={styles.orderButtonText}>הזמן</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feedCard: {
    position: 'relative',
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  feedImageWrap: {
    position: 'relative',
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: theme.colors.cardAlt,
    borderRadius: 20,
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
    left: 14,
    width: 36,
    height: 176,
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
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 20,
  },
  heartBadge: {
    position: 'absolute',
    top: 54,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderColor: theme.colors.border,
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
    color: theme.colors.accent,
    fontWeight: '700',
    backgroundColor: 'rgba(255,246,238,0.95)',
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
    borderColor: theme.colors.card,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  trashBadge: {
    position: 'absolute',
    right: 16,
    bottom: 54,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
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
    flexDirection: 'row-reverse',
    gap: 14,
    paddingTop: 10,
    paddingBottom: 6,
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingRight: 18,
    alignItems: 'center',
  },
  orderButton: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: theme.colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginRight: 6,
  },
  orderButtonText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  reviewCard: {
    marginTop: 12,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.cardAlt,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
    minWidth: 72,
    alignItems: 'flex-end',
  },
  ratingTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  ratingValueInline: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  ratingLabelInline: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textMuted,
    alignSelf: 'flex-end',
    paddingRight: 8,
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
