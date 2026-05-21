export type MenuDish = {
  id: number;
  name: string;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuDish[];
};

export type DishSummary = {
  key: string;
  name: string;
  imageUrl: string | null;
  avgTasty: number;
  avgFilling: number;
  cuisine: string;
  hasUploads: boolean;
  reviewCount: number;
};

export type RestaurantMenuRow =
  | { type: 'header'; id: string; title: string }
  | { type: 'dish'; id: string; dish: DishSummary };

type DishAssociationLike = {
  dish_id: number | null;
  dish_name: string | null;
  image_url: string | null;
  cuisine?: string | null;
  tasty_score: number | null;
  filling_score: number | null;
  created_at: string | null;
};

const normalizeCategoryName = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeDishName = (raw: unknown) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeDishLookup = (raw: unknown) => {
  const name = normalizeDishName(raw);
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeDishId = (raw: unknown) => {
  if (typeof raw === 'number') return raw;
  return null;
};

export const mapMenuToCategories = (data: any): MenuCategory[] => {
  const categories: any[] = Array.isArray(data?.Data)
    ? data.Data
    : Array.isArray(data?.Data?.Categories)
      ? data.Data.Categories
      : [];

  const categoryMap = new Map<string, MenuCategory>();
  const ensureCategory = (id: string, name: string) => {
    if (!categoryMap.has(id)) {
      categoryMap.set(id, { id, name, items: [] });
    }
    return categoryMap.get(id)!;
  };

  categories.forEach((cat) => {
    const categoryName =
      normalizeCategoryName(cat?.CategoryName) ??
      normalizeCategoryName(cat?.Name) ??
      normalizeCategoryName(cat?.CategoryTitle);
    const categoryIdRaw = normalizeCategoryName(cat?.CategoryId ?? cat?.Id ?? cat?.CategoryID);
    const categoryId = categoryIdRaw ?? categoryName ?? 'uncategorized';
    const safeName = categoryName ?? 'קטגוריה';

    const dishesArr = Array.isArray(cat?.DishList)
      ? cat.DishList
      : Array.isArray(cat?.Dishes)
        ? cat.Dishes
        : [];

    const bucket = ensureCategory(categoryId, safeName);
    dishesArr.forEach((d: any) => {
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
      const id =
        normalizeDishId(d?.DishId) ??
        normalizeDishId(d?.Id) ??
        normalizeDishId(d?.DishID);
      if (!name || id === null) return;
      bucket.items.push({ id, name });
    });
  });

  if (categoryMap.size === 0 && Array.isArray(data?.Data?.Dishes)) {
    const bucket = ensureCategory('uncategorized', 'קטגוריה');
    data.Data.Dishes.forEach((d: any) => {
      const name =
        normalizeDishName(d?.DishName) ??
        normalizeDishName(d?.Name);
      const id =
        normalizeDishId(d?.DishId) ??
        normalizeDishId(d?.Id) ??
        normalizeDishId(d?.DishID);
      if (!name || id === null) return;
      bucket.items.push({ id, name });
    });
  }

  return Array.from(categoryMap.values()).filter((cat) => cat.items.length > 0);
};

export const buildFallbackCategoriesFromDishes = <T extends DishAssociationLike>(dishes: T[]): MenuCategory[] => {
  const seen = new Map<string, MenuDish>();
  dishes.forEach((dish) => {
    const name = normalizeDishName(dish.dish_name);
    if (!name) return;
    const key = normalizeDishLookup(name) ?? name;
    if (!seen.has(key)) {
      seen.set(key, {
        id: dish.dish_id ?? seen.size + 1,
        name,
      });
    }
  });

  if (seen.size === 0) return [];

  return [
    {
      id: 'fallback-menu',
      name: 'מנות',
      items: Array.from(seen.values()).sort((left, right) =>
        left.name.localeCompare(right.name, 'he')
      ),
    },
  ];
};

export const summarizeMenuDishes = <T extends DishAssociationLike>(categories: MenuCategory[], list: T[]) => {
  const uniqueMenuDishes = new Map<
    string,
    { name: string; ids: Set<number>; primaryId: number }
  >();

  categories.forEach((category) => {
    category.items.forEach((dish) => {
      const normalizedName = normalizeDishLookup(dish.name) ?? `dish:${dish.id}`;
      if (!uniqueMenuDishes.has(normalizedName)) {
        uniqueMenuDishes.set(normalizedName, {
          name: dish.name,
          ids: new Set([dish.id]),
          primaryId: dish.id,
        });
      } else {
        uniqueMenuDishes.get(normalizedName)!.ids.add(dish.id);
      }
    });
  });

  return Array.from(uniqueMenuDishes.values()).map((menuDish) => {
    const normalizedMenuName = normalizeDishLookup(menuDish.name);
    const matchingRows = list.filter((row) => {
      if (row.dish_id !== null && menuDish.ids.has(row.dish_id)) {
        return true;
      }
      if (!normalizedMenuName) return false;
      const normalizedRowName = normalizeDishLookup(row.dish_name);
      if (!normalizedRowName) return false;
      return normalizedRowName === normalizedMenuName;
    });

    let tastySum = 0;
    let tastyCount = 0;
    let fillingSum = 0;
    let fillingCount = 0;
    let imageUrl: string | null = null;
    let cuisine = 'ללא מטבח';
    let latestCreatedAt = 0;

    matchingRows.forEach((row) => {
      if (typeof row.tasty_score === 'number') {
        tastySum += row.tasty_score;
        tastyCount += 1;
      }
      if (typeof row.filling_score === 'number') {
        fillingSum += row.filling_score;
        fillingCount += 1;
      }
      const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (createdAt >= latestCreatedAt) {
        latestCreatedAt = createdAt;
        imageUrl = row.image_url ?? imageUrl;
        cuisine = row.cuisine ?? cuisine;
      }
    });

    return {
      key: String(menuDish.primaryId),
      name: menuDish.name,
      imageUrl,
      avgTasty: tastyCount ? tastySum / tastyCount : 0,
      avgFilling: fillingCount ? fillingSum / fillingCount : 0,
      cuisine,
      hasUploads: matchingRows.length > 0,
      reviewCount: matchingRows.length,
    } satisfies DishSummary;
  });
};

export const buildRowsFromMenu = (
  categories: MenuCategory[],
  summaries: DishSummary[],
  collapsed: Set<string>,
  reviewedSectionTitle: string,
  searchQuery = ''
): RestaurantMenuRow[] => {
  const rows: RestaurantMenuRow[] = [];
  const reviewedSectionKey = 'reviewed';
  const needle = normalizeDishLookup(searchQuery) ?? '';
  const byDishId = new Map<number, DishSummary>();
  const byDishName = new Map<string, DishSummary>();
  summaries.forEach((dish) => {
    const normalizedName = normalizeDishLookup(dish.name);
    if (normalizedName) byDishName.set(normalizedName, dish);
    const id = Number(dish.key);
    if (!Number.isNaN(id) && !byDishId.has(id)) byDishId.set(id, dish);
  });

  const reviewedDishes = summaries
    .filter((dish) => dish.hasUploads)
    .filter((dish) => !needle || (normalizeDishLookup(dish.name) ?? '').includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name, 'he'));

  if (reviewedDishes.length > 0) {
    rows.push({ type: 'header', id: `header-${reviewedSectionKey}`, title: reviewedSectionTitle });
    if (!collapsed.has(reviewedSectionKey)) {
      reviewedDishes.forEach((dish) => {
        rows.push({
          type: 'dish',
          id: `reviewed-${dish.key}`,
          dish,
        });
      });
    }
  }

  categories.forEach((cat) => {
    const filteredItems = cat.items.filter((dish) => {
      if (!needle) return true;
      return (normalizeDishLookup(dish.name) ?? '').includes(needle);
    });
    if (filteredItems.length === 0) return;

    rows.push({ type: 'header', id: `header-${cat.id}`, title: cat.name });
    if (collapsed.has(cat.id)) return;
    filteredItems.forEach((dish) => {
      const summary =
        byDishName.get(normalizeDishLookup(dish.name) ?? '') ?? byDishId.get(dish.id);
      rows.push({
        type: 'dish',
        id: `${cat.id}-${dish.id}`,
        dish: {
          key: String(dish.id),
          name: dish.name,
          imageUrl: summary?.imageUrl ?? null,
          avgTasty: summary?.avgTasty ?? 0,
          avgFilling: summary?.avgFilling ?? 0,
          cuisine: summary?.cuisine ?? 'ללא מטבח',
          hasUploads: summary?.hasUploads ?? false,
          reviewCount: summary?.reviewCount ?? 0,
        },
      });
    });
  });

  return rows;
};
