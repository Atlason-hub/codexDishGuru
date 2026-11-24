import { fetchSupabaseJson, json, requireAdmin, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const access = await requireAdmin(env, request);
  if (access instanceof Response) return access;
  const groupId = searchParam(request, "groupId");
  if (!groupId) return json({ error: "Missing groupId" }, { status: 400 });
  try {
    return json(await fetchSupabaseJson(env, `AppUsers?select=user_id,email&group_id=eq.${encodeURIComponent(groupId)}&order=email.asc.nullslast`));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to load group users" }, { status: 500 });
  }
};
