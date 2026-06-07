import { fetchSupabaseJson, json, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

const APP_USERS_TABLE = "AppUsers";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const companyId = searchParam(request, "companyId");
  if (!companyId) {
    return json({ error: "Missing companyId" }, { status: 400 });
  }

  try {
    const rows = await fetchSupabaseJson<Array<{ user_id?: string | null; email?: string | null }>>(
      env,
      `${APP_USERS_TABLE}?select=user_id,email&company_id=eq.${encodeURIComponent(companyId)}&order=email.asc.nullslast`
    );

    return json(
      rows.map((row) => ({
        userId: row.user_id ?? null,
        email: row.email ?? null
      }))
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load company users" },
      { status: 500 }
    );
  }
};
