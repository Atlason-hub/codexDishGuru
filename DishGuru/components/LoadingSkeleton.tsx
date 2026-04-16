import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../lib/theme';

function SkeletonBlock({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.block, style]} />;
}

export function HomeFeedSkeleton() {
  return (
    <View style={styles.stack}>
      {[0, 1].map((index) => (
        <View key={index} style={styles.feedCard}>
          <SkeletonBlock style={styles.feedImage} />
          <View style={styles.feedFooter}>
            <SkeletonBlock style={styles.feedButton} />
            <View style={styles.feedRatings}>
              <SkeletonBlock style={styles.feedRatingLine} />
              <SkeletonBlock style={styles.feedRatingLine} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function DishScreenSkeleton() {
  return (
    <View style={styles.stack}>
      <View style={styles.avgCard}>
        <SkeletonBlock style={styles.avgTitle} />
        <SkeletonBlock style={styles.avgLine} />
        <SkeletonBlock style={styles.avgLine} />
      </View>
      <View style={styles.feedCard}>
        <SkeletonBlock style={styles.feedImage} />
        <View style={styles.feedFooter}>
          <SkeletonBlock style={styles.feedButton} />
          <View style={styles.feedRatings}>
            <SkeletonBlock style={styles.feedRatingLine} />
            <SkeletonBlock style={styles.feedRatingLine} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function RestaurantScreenSkeleton() {
  return (
    <View style={styles.stack}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={styles.restaurantCard}>
          <SkeletonBlock style={styles.restaurantThumb} />
          <View style={styles.restaurantMeta}>
            <SkeletonBlock style={styles.restaurantTitle} />
            <SkeletonBlock style={styles.restaurantLine} />
            <SkeletonBlock style={styles.restaurantLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
    width: '100%',
  },
  block: {
    backgroundColor: theme.colors.accentSoft,
    opacity: 0.55,
    borderRadius: 14,
  },
  feedCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 26,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  feedImage: {
    height: 220,
    borderRadius: 24,
  },
  feedFooter: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  feedButton: {
    width: 132,
    height: 56,
    borderRadius: 24,
  },
  feedRatings: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 10,
  },
  feedRatingLine: {
    width: 180,
    height: 22,
    borderRadius: 12,
  },
  avgCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  avgTitle: {
    alignSelf: 'flex-end',
    width: 120,
    height: 24,
  },
  avgLine: {
    alignSelf: 'flex-end',
    width: 220,
    height: 22,
  },
  restaurantCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
  },
  restaurantThumb: {
    width: 92,
    height: 92,
    borderRadius: 20,
  },
  restaurantMeta: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 12,
  },
  restaurantTitle: {
    width: 180,
    height: 28,
  },
  restaurantLine: {
    width: 180,
    height: 22,
  },
});
