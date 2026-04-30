export type DishReportItem = {
  id: string;
  dishAssociationId: string;
  reportedByUserId: string;
  reporterEmail: string;
  uploadedByUserId?: string | null;
  uploadedByEmail?: string | null;
  reason: string;
  details?: string | null;
  status: string;
  createdAt?: string | null;
  dishName?: string | null;
  restaurantName?: string | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  dishCreatedAt?: string | null;
};

export async function fetchDishReports(): Promise<DishReportItem[]> {
  const response = await fetch("/api/dish-reports");
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to load dish reports");
  }

  try {
    return JSON.parse(text) as DishReportItem[];
  } catch {
    throw new Error(text || "Invalid JSON response from /api/dish-reports");
  }
}
