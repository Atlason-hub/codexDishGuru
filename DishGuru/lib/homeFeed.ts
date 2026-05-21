export type HomeDishAssociation = {
  id: string;
  user_id: string | null;
  dish_id: number | null;
  image_url: string | null;
  dish_name: string | null;
  restaurant_name: string | null;
  restaurant_id: number | null;
  tasty_score: number | null;
  filling_score: number | null;
  image_path?: string | null;
  created_at: string | null;
  review_text?: string | null;
};

export type GroupedHomeAssociation = {
  key: string;
  items: HomeDishAssociation[];
  dishName: string;
  restaurantName: string;
  dishId: number | null;
  restaurantId: number | null;
};

export const normalizeHomeSearchNeedle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const getRenderableHomeAssociations = ({
  dishAssociations,
  favorites,
  showFavoritesOnly,
  showRestaurantOnly,
  restaurantFilterId,
  restaurantFilterName,
  isGuestMode,
  resolvedGlobalDishIds,
}: {
  dishAssociations: HomeDishAssociation[];
  favorites: Record<string, boolean>;
  showFavoritesOnly: boolean;
  showRestaurantOnly: boolean;
  restaurantFilterId: number | null;
  restaurantFilterName: string | null;
  isGuestMode: boolean;
  resolvedGlobalDishIds: string[];
}) => {
  const visibleAssociations = showFavoritesOnly
    ? dishAssociations.filter((item) => favorites[item.id])
    : showRestaurantOnly
      ? dishAssociations.filter((item) => {
          if (restaurantFilterId !== null) {
            return item.restaurant_id === restaurantFilterId;
          }
          if (restaurantFilterName) {
            return (item.restaurant_name ?? '') === restaurantFilterName;
          }
          return true;
        })
      : dishAssociations;

  if (isGuestMode || resolvedGlobalDishIds.length === 0) {
    return visibleAssociations;
  }

  const globalDishIdSet = new Set(resolvedGlobalDishIds);
  const nonGlobalRows = visibleAssociations.filter(
    (item) => !globalDishIdSet.has(String(item.id))
  );

  return nonGlobalRows.length >= 3 ? nonGlobalRows : visibleAssociations;
};

export const groupHomeAssociations = (
  associations: HomeDishAssociation[],
  searchQuery: string
): GroupedHomeAssociation[] => {
  const dedupedAssociations = (() => {
    const seen = new Set<string>();
    return associations.filter((item) => {
      const semanticKey = [
        item.user_id ?? '',
        item.dish_id ?? '',
        item.restaurant_id ?? '',
        item.image_path ?? item.image_url ?? '',
      ].join('|');
      if (!semanticKey.replace(/\|/g, '')) {
        return true;
      }
      if (seen.has(semanticKey)) {
        return false;
      }
      seen.add(semanticKey);
      return true;
    });
  })();

  const needle = searchQuery.trim().toLowerCase();
  const filtered = needle
    ? dedupedAssociations.filter((item) => {
        const dishName = (item.dish_name ?? '').toLowerCase();
        const restName = (item.restaurant_name ?? '').toLowerCase();
        return dishName.includes(needle) || restName.includes(needle);
      })
    : dedupedAssociations;

  const groups = new Map<string, HomeDishAssociation[]>();
  filtered.forEach((item) => {
    const normalizedDish = (item.dish_name ?? '').trim().toLowerCase();
    const normalizedRest = (item.restaurant_name ?? '').trim().toLowerCase();
    const dishKey = normalizedDish
      ? `dishName:${normalizedDish}`
      : item.dish_id !== null
        ? `dish:${item.dish_id}`
        : 'dish:unknown';
    const restKey = normalizedRest
      ? `restName:${normalizedRest}`
      : item.restaurant_id !== null
        ? `rest:${item.restaurant_id}`
        : 'rest:unknown';
    const key = `${dishKey}|${restKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });

  return Array.from(groups.entries()).map(([key, items]) => {
    const sorted = [...items].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return {
      key,
      items: sorted,
      dishName: items[0]?.dish_name ?? '',
      restaurantName: items[0]?.restaurant_name ?? '',
      dishId: items[0]?.dish_id ?? null,
      restaurantId: items[0]?.restaurant_id ?? null,
    };
  });
};
