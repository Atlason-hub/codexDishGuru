import { fetchSupabase, fetchSupabaseJson, json, requireAdmin, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

const statuses = new Set(["new", "investigating", "resolved", "ignored"]);

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const write = request.method === "PATCH" || request.method === "DELETE";
  const access = await requireAdmin(env, request, { write });
  if (access instanceof Response) return access;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.trim() ?? "";
      const platform = url.searchParams.get("platform")?.trim() ?? "";
      const search = url.searchParams.get("search")?.trim().slice(0, 100) ?? "";
      const filters = [
        "select=id,fingerprint,error_message,stack_trace,screen,action,user_id,company_id,group_id,app_version,build_version,platform,os_version,expo_version,context,status,occurrence_count,first_seen_at,last_seen_at",
        "order=last_seen_at.desc",
        "limit=200"
      ];
      if (status && statuses.has(status)) filters.push(`status=eq.${encodeURIComponent(status)}`);
      if (platform) filters.push(`platform=eq.${encodeURIComponent(platform)}`);
      if (search) filters.push(`or=(error_message.ilike.*${encodeURIComponent(search)}*,screen.ilike.*${encodeURIComponent(search)}*)`);
      return json(await fetchSupabaseJson(env, `app_errors?${filters.join("&")}`));
    }

    const id = searchParam(request, "id");
    if (!id) return json({ error: "Missing error id" }, { status: 400 });

    if (request.method === "PATCH") {
      const body = await request.json() as { status?: string };
      if (!body.status || !statuses.has(body.status)) return json({ error: "Invalid status" }, { status: 400 });
      const response = await fetchSupabase(env, `app_errors?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ status: body.status })
      });
      return new Response(await response.text(), { status: response.status });
    }

    if (request.method === "DELETE") {
      const response = await fetchSupabase(env, `app_errors?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
      return new Response(await response.text(), { status: response.status });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error monitoring request failed" }, { status: 500 });
  }
};
