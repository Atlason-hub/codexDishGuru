import { fetchSupabaseJson, json, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

const ADMIN_USERS_TABLE = "admin_users";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const userId = searchParam(request, "userId");
  if (!userId) {
    return json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const rows = await fetchSupabaseJson<
      Array<{ id?: string | null; role?: string | null; status?: string | null; email?: string | null }>
    >(
      env,
      `${ADMIN_USERS_TABLE}?select=id,role,status,email&id=eq.${encodeURIComponent(userId)}&limit=1`
    );

    const row = rows[0];
    const role = row?.role === "admin" || row?.role === "viewer" ? row.role : null;
    const allowed = Boolean(role) && row?.status === "active";

    return json({ allowed, role });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to check admin access" },
      { status: 500 }
    );
  }
};
