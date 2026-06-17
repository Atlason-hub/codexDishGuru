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

function normalizeDishImageUrl(rawUrl?: string | null, rawPath?: string | null): string | undefined {
  if (rawPath) {
    return `/api/dish-image?path=${encodeURIComponent(rawPath)}`;
  }

  if (!rawUrl) return undefined;

  const publicMarker = "/storage/v1/object/public/";
  const publicIndex = rawUrl.indexOf(publicMarker);
  if (publicIndex !== -1) {
    const tail = rawUrl.slice(publicIndex + publicMarker.length);
    const segments = tail.split("/");
    const bucket = segments[0];
    const path = segments.slice(1).join("/");
    if (bucket && path) {
      return `/api/dish-image?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
    }
  }

  return rawUrl;
}

export async function fetchDishReports(): Promise<DishReportItem[]> {
  const response = await fetch("/api/dish-reports");
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to load dish reports");
  }

  try {
    const rows = JSON.parse(text) as DishReportItem[];
    return rows.map((row) => ({
      ...row,
      imageUrl: normalizeDishImageUrl(row.imageUrl, row.imagePath)
    }));
  } catch {
    throw new Error(text || "Invalid JSON response from /api/dish-reports");
  }
}

export async function deleteDishReport(reportId: string): Promise<void> {
  const response = await fetch(`/api/dish-reports?id=${encodeURIComponent(reportId)}`, {
    method: "DELETE"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to delete dish report");
  }
}
