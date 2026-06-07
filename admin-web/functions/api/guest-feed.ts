import { fetchSupabaseJson, json, type Env, type PagesFunction } from "../_lib/cloudflare";

const DISH_SELECT =
  "id,user_id,dish_id,image_url,image_path,dish_name,restaurant_name,restaurant_id,tasty_score,filling_score,created_at,review_text,visibility_scope";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    let dishes = await fetchSupabaseJson<Array<Record<string, unknown>>>(
      env,
      `dish_associations?select=${encodeURIComponent(DISH_SELECT)}&visibility_scope=eq.global&order=created_at.desc`
    );
    let source = "visibility_scope=global";

    if ((!Array.isArray(dishes) || dishes.length === 0) && env.GUEST_USER_ID) {
      dishes = await fetchSupabaseJson<Array<Record<string, unknown>>>(
        env,
        `dish_associations?select=${encodeURIComponent(DISH_SELECT)}&user_id=eq.${encodeURIComponent(env.GUEST_USER_ID)}&order=created_at.desc`
      );
      source = "guest_user_id";
    }

    const resolvedUserId =
      env.GUEST_USER_ID ||
      (Array.isArray(dishes) && typeof dishes[0]?.user_id === "string" ? String(dishes[0].user_id) : "");

    let companyId = env.GUEST_COMPANY_ID || "";

    if (!companyId && resolvedUserId) {
      const appUsers = await fetchSupabaseJson<Array<{ company_id?: string | null }>>(
        env,
        `AppUsers?select=company_id&user_id=eq.${encodeURIComponent(resolvedUserId)}&limit=1`
      );
      companyId = appUsers?.[0]?.company_id ?? "";
    }

    let context: null | Record<string, unknown> = null;
    if (companyId) {
      const companies = await fetchSupabaseJson<Array<Record<string, unknown>>>(
        env,
        `companies?select=${encodeURIComponent("id,city_id,street_id,logo_url,logo,order_vendor")}&id=eq.${encodeURIComponent(companyId)}&limit=1`
      );
      const company = companies?.[0] ?? null;
      if (company) {
        context = {
          userId: resolvedUserId || null,
          companyId: company.id ?? null,
          cityId: company.city_id ?? null,
          streetId: company.street_id ?? null,
          logoUrl: company.logo_url ?? company.logo ?? null,
          orderVendor: company.order_vendor ?? null
        };
      }
    }

    return json({
      dishes: Array.isArray(dishes) ? dishes : [],
      context,
      source
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load guest feed" },
      { status: 500 }
    );
  }
};
