import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

async function fetchRest(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed for ${path}`);
  }
  return text ? JSON.parse(text) : [];
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  try {
    const reports = (await fetchRest(
      "dish_reports?select=*&order=created_at.desc"
    )) as Array<{
      id: string;
      dish_association_id: string;
      reported_by_user_id: string;
      reason: string;
      details?: string | null;
      status: string;
      created_at?: string | null;
    }>;

    const dishIds = Array.from(
      new Set(reports.map((report) => report.dish_association_id).filter(Boolean))
    );
    const reporterIds = Array.from(
      new Set(reports.map((report) => report.reported_by_user_id).filter(Boolean))
    );

    const dishes = dishIds.length
      ? ((await fetchRest(
          `dish_associations?select=id,dish_name,restaurant_name,image_url,image_path,created_at&id=in.(${dishIds
            .map(encodeURIComponent)
            .join(",")})`
        )) as Array<{
          id: string;
          dish_name?: string | null;
          restaurant_name?: string | null;
          image_url?: string | null;
          image_path?: string | null;
          created_at?: string | null;
        }>)
      : [];

    const reporters = reporterIds.length
      ? ((await fetchRest(
          `AppUsers?select=user_id,email&user_id=in.(${reporterIds
            .map(encodeURIComponent)
            .join(",")})`
        )) as Array<{
          user_id: string;
          email?: string | null;
        }>)
      : [];

    const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
    const reportersById = new Map(reporters.map((reporter) => [reporter.user_id, reporter]));

    const payload = reports.map((report) => {
      const dish = dishesById.get(report.dish_association_id);
      const reporter = reportersById.get(report.reported_by_user_id);

      return {
        id: report.id,
        dishAssociationId: report.dish_association_id,
        reportedByUserId: report.reported_by_user_id,
        reporterEmail: reporter?.email ?? report.reported_by_user_id,
        reason: report.reason,
        details: report.details ?? null,
        status: report.status,
        createdAt: report.created_at ?? null,
        dishName: dish?.dish_name ?? null,
        restaurantName: dish?.restaurant_name ?? null,
        imageUrl: dish?.image_url ?? null,
        imagePath: dish?.image_path ?? null,
        dishCreatedAt: dish?.created_at ?? null
      };
    });

    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load dish reports"
    });
  }
}
