import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GUEST_COMPANY_ID = process.env.GUEST_COMPANY_ID || "";
const GUEST_USER_ID = process.env.GUEST_USER_ID || "";

const DISH_SELECT =
  "id,user_id,dish_id,image_url,image_path,dish_name,restaurant_name,restaurant_id,tasty_score,filling_score,created_at,review_text,visibility_scope";

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

async function fetchRest(path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed for ${path}`);
  }
  return text ? JSON.parse(text) : null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  try {
    let dishes = (await fetchRest(
      `dish_associations?select=${encodeURIComponent(DISH_SELECT)}&visibility_scope=eq.global&order=created_at.desc`
    )) as Array<Record<string, unknown>>;
    let source = "visibility_scope=global";

    if ((!Array.isArray(dishes) || dishes.length === 0) && GUEST_USER_ID) {
      dishes = (await fetchRest(
        `dish_associations?select=${encodeURIComponent(DISH_SELECT)}&user_id=eq.${encodeURIComponent(GUEST_USER_ID)}&order=created_at.desc`
      )) as Array<Record<string, unknown>>;
      source = "guest_user_id";
    }

    const resolvedUserId =
      GUEST_USER_ID ||
      (Array.isArray(dishes) && typeof dishes[0]?.user_id === "string" ? String(dishes[0].user_id) : "");

    let companyId = GUEST_COMPANY_ID;

    if (!companyId && resolvedUserId) {
      const appUsers = (await fetchRest(
        `AppUsers?select=company_id&user_id=eq.${encodeURIComponent(resolvedUserId)}&limit=1`
      )) as Array<{ company_id?: string | null }>;
      companyId = appUsers?.[0]?.company_id ?? "";
    }

    let context = null as null | Record<string, unknown>;
    if (companyId) {
      const companies = (await fetchRest(
        `companies?select=${encodeURIComponent("id,city_id,street_id,logo_url,logo,order_vendor")}&id=eq.${encodeURIComponent(companyId)}&limit=1`
      )) as Array<Record<string, unknown>>;
      const company = companies?.[0] ?? null;
      if (company) {
        context = {
          userId: resolvedUserId || null,
          companyId: company.id ?? null,
          cityId: company.city_id ?? null,
          streetId: company.street_id ?? null,
          logoUrl: company.logo_url ?? company.logo ?? null,
          orderVendor: company.order_vendor ?? null,
        };
      }
    }

    return json(res, 200, {
      dishes: Array.isArray(dishes) ? dishes : [],
      context,
      source,
    });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load guest feed",
    });
  }
}
