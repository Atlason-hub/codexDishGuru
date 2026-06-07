import { fetchSupabase, fetchSupabaseJson, json, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

const TABLE = "companies";
const APP_USERS_TABLE = "AppUsers";

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const base = TABLE;

  try {
    if (request.method === "GET") {
      const companies = await fetchSupabaseJson<Array<Record<string, unknown>>>(env, `${base}?select=*`);
      const appUsers = await fetchSupabaseJson<Array<{ company_id?: string | null }>>(
        env,
        `${APP_USERS_TABLE}?select=company_id`
      );

      const counts = new Map<string, number>();
      for (const user of appUsers) {
        const companyId = user.company_id;
        if (!companyId) continue;
        counts.set(companyId, (counts.get(companyId) ?? 0) + 1);
      }

      return json(
        companies.map((company) => ({
          ...company,
          users_count: counts.get(String(company.id)) ?? 0
        }))
      );
    }

    if (request.method === "POST") {
      const body = await request.json();
      const response = await fetchSupabase(env, base, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(body ?? {})
      });
      return new Response(await response.text(), { status: response.status });
    }

    if (request.method === "PUT") {
      const id = searchParam(request, "id");
      if (!id) {
        return json({ error: "Missing id" }, { status: 400 });
      }
      const body = await request.json();
      const response = await fetchSupabase(env, `${base}?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(body ?? {})
      });
      return new Response(await response.text(), { status: response.status });
    }

    if (request.method === "DELETE") {
      const id = searchParam(request, "id");
      if (!id) {
        return json({ error: "Missing id" }, { status: 400 });
      }
      const response = await fetchSupabase(env, `${base}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=representation"
        }
      });
      return new Response(await response.text(), { status: response.status });
    }

    return json({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Server error" }, { status: 500 });
  }
};
