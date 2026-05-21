import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeFeedSkeleton } from './LoadingSkeleton';
import { theme } from '../lib/theme';
import { publishHomeTab, type HomeTabKey } from '../lib/homeTabs';

type Props = {
  isRTL: boolean;
  t: (key: any) => string;
  showRestaurantOnly: boolean;
  showFavoritesOnly: boolean;
  restaurantFilterName: string | null;
  loading: boolean;
  hasLoaded: boolean;
  hasFeedItems: boolean;
  isRefreshing: boolean;
  error: string | null;
  homeSearch: string;
  shouldShowMainTabs: boolean;
  activeHomeTab: HomeTabKey;
  onBack: () => void;
  onHomeSearchChange: (value: string) => void;
  onHomeSearchSubmit: () => void;
  onHomeSearchClear: () => void;
  onSetActiveHomeTab: (tab: HomeTabKey) => void;
};

export default function HomeFeedHeader({
  isRTL,
  t,
  showRestaurantOnly,
  showFavoritesOnly,
  restaurantFilterName,
  loading,
  hasLoaded,
  hasFeedItems,
  isRefreshing,
  error,
  homeSearch,
  shouldShowMainTabs,
  activeHomeTab,
  onBack,
  onHomeSearchChange,
  onHomeSearchSubmit,
  onHomeSearchClear,
  onSetActiveHomeTab,
}: Props) {
  const shouldShowSkeleton = loading && !isRefreshing && !hasLoaded && !hasFeedItems;

  return (
    <View style={styles.listHeader}>
      {showRestaurantOnly ? (
        <View style={[styles.favoritesHeader, !isRTL && styles.favoritesHeaderLtr]}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons
              name={isRTL ? 'chevron-back' : 'chevron-forward'}
              size={18}
              color={theme.colors.ink}
            />
          </Pressable>
          <Text style={[styles.favoritesHeaderText, !isRTL && styles.favoritesHeaderTextLtr]}>
            {restaurantFilterName ?? 'מסעדה'}
          </Text>
        </View>
      ) : null}
      {showFavoritesOnly ? (
        <View style={[styles.favoritesHeader, !isRTL && styles.favoritesHeaderLtr]}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons
              name={isRTL ? 'chevron-back' : 'chevron-forward'}
              size={18}
              color={theme.colors.ink}
            />
          </Pressable>
          <Text style={[styles.favoritesHeaderText, !isRTL && styles.favoritesHeaderTextLtr]}>
            {t('favoritesTitle')}
          </Text>
        </View>
      ) : null}
      {shouldShowSkeleton ? (
        <View style={styles.results}>
          <HomeFeedSkeleton />
        </View>
      ) : error ? (
        <View style={styles.results}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {!showFavoritesOnly ? (
        <View style={[styles.homeSearchBox, !isRTL && styles.homeSearchBoxLtr]}>
          <Ionicons name="search" size={16} color={theme.colors.accent} />
          <TextInput
            style={styles.homeSearchInput}
            placeholder={t('homeSearchPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            value={homeSearch}
            onChangeText={onHomeSearchChange}
            onSubmitEditing={onHomeSearchSubmit}
            returnKeyType="search"
            textAlign={isRTL ? 'right' : 'left'}
          />
          {homeSearch.trim().length > 0 ? (
            <Pressable style={styles.homeSearchClear} onPress={onHomeSearchClear} hitSlop={6}>
              <Ionicons name="close" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {shouldShowMainTabs ? (
        <View style={styles.tabsSection}>
          <View style={[styles.tabsRail, !isRTL && styles.tabsRailLtr]}>
            <View style={[styles.tabsRow, !isRTL && styles.tabsRowLtr]}>
            {([
              ['dishes', t('homeTabDishes')],
              ['restaurants', t('homeTabRestaurants')],
            ] as const).map(([tabKey, label]) => {
              const isActive = activeHomeTab === tabKey;
              return (
                <Pressable
                  key={tabKey}
                  style={styles.tabChip}
                  onPress={() => {
                    publishHomeTab(tabKey);
                    onSetActiveHomeTab(tabKey);
                  }}
                >
                  <View style={styles.tabChipInner}>
                    <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                      {label}
                    </Text>
                    <View
                      style={[styles.tabUnderline, isActive && styles.tabUnderlineActive]}
                    />
                  </View>
                </Pressable>
              );
            })}
            </View>
          </View>
          <View style={styles.tabsDivider} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listHeader: {
    gap: 0,
    paddingTop: 15,
    paddingBottom: 15,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 0,
  },
  favoritesHeaderLtr: {
    flexDirection: 'row-reverse',
  },
  favoritesHeaderText: {
    fontSize: 18,
    fontFamily: theme.typography.bold,
    color: theme.colors.text,
    textAlign: 'right',
    flex: 1,
    marginRight: 8,
  },
  favoritesHeaderTextLtr: {
    textAlign: 'left',
    marginRight: 0,
    marginLeft: 8,
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
  },
  results: {
    alignSelf: 'stretch',
    flex: 1,
    padding: 12,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  homeSearchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 0,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#F3F3F3',
    alignSelf: 'center',
    width: '82%',
    marginTop: 0,
    marginBottom: 0,
  },
  homeSearchBoxLtr: {
    flexDirection: 'row',
  },
  homeSearchInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.text,
    textAlign: 'right',
  },
  homeSearchClear: {
    height: 28,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: theme.colors.white,
  },
  tabsSection: {
    marginTop: 10,
  },
  tabsRail: {
    marginHorizontal: -4,
    paddingTop: 0,
    paddingBottom: 5,
    borderRadius: 18,
    backgroundColor: 'rgba(199, 93, 44, 0.04)',
  },
  tabsRailLtr: {
    alignItems: 'stretch',
  },
  tabsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  tabsRowLtr: {
    flexDirection: 'row',
  },
  tabChip: {
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tabChipInner: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 0,
  },
  tabChipText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.medium,
    letterSpacing: 0.1,
  },
  tabChipTextActive: {
    color: theme.colors.text,
    fontFamily: theme.typography.bold,
  },
  tabUnderline: {
    width: 34,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: theme.colors.accent,
  },
  tabsDivider: {
    marginTop: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    shadowColor: theme.colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
});
