import { fetchSupabase, fetchSupabaseJson, json, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

const select = "id,company_key,name,join_code,order_vendor,street_id,street,number,city_id,city_name,logo_url,created_at";

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  try {
    if (request.method === "GET") {
      const [groups, users] = await Promise.all([
        fetchSupabaseJson<Array<Record<string, unknown>>>(env, `companies?select=${select}&group_type=eq.code`),
        fetchSupabaseJson<Array<{ group_id?: string | null }>>(env, "AppUsers?select=group_id")
      ]);
      const counts = new Map<string, number>();
      users.forEach(({ group_id }) => {
        if (group_id) counts.set(group_id, (counts.get(group_id) ?? 0) + 1);
      });
      return json(groups.map((group) => ({ ...group, users_count: counts.get(String(group.id)) ?? 0 })));
    }

    const id = searchParam(request, "id");
    if ((request.method === "PUT" || request.method === "DELETE") && !id) {
      return json({ error: "Missing id" }, { status: 400 });
    }
    if (request.method === "DELETE") {
      const response = await fetchSupabase(env, `companies?id=eq.${encodeURIComponent(id)}&group_type=eq.code`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" }
      });
      return new Response(await response.text(), { status: response.status });
    }
    if (request.method === "POST" || request.method === "PUT") {
      const body = (await request.json()) as Record<string, unknown>;
      const clean = { ...body, group_type: "code", domain: `group:${String(body.id ?? id)}` };
      const response = await fetchSupabase(
        env,
        request.method === "POST" ? "companies" : `companies?id=eq.${encodeURIComponent(id)}&group_type=eq.code`,
        {
          method: request.method === "POST" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(clean)
        }
      );
      return new Response(await response.text(), { status: response.status });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
};

