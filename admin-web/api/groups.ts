import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };
const select = "id,company_key,name,join_code,order_vendor,street_id,street,number,city_id,city_name,logo_url,created_at";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return res.status(500).json({ error: "Missing Supabase settings" });
  try {
    if (req.method === "GET") {
      const [groupsResponse, usersResponse] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/companies?select=${select}&group_type=eq.code`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/AppUsers?select=group_id`, { headers })
      ]);
      if (!groupsResponse.ok) return res.status(groupsResponse.status).send(await groupsResponse.text());
      if (!usersResponse.ok) return res.status(usersResponse.status).send(await usersResponse.text());
      const groups = await groupsResponse.json() as Array<Record<string, unknown>>;
      const users = await usersResponse.json() as Array<{ group_id?: string | null }>;
      const counts = new Map<string, number>();
      users.forEach(({ group_id }) => group_id && counts.set(group_id, (counts.get(group_id) ?? 0) + 1));
      return res.status(200).json(groups.map((group) => ({ ...group, users_count: counts.get(String(group.id)) ?? 0 })));
    }
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if ((req.method === "PUT" || req.method === "DELETE") && !id) return res.status(400).json({ error: "Missing id" });
    if (req.method === "DELETE") {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${encodeURIComponent(id)}&group_type=eq.code`, {
        method: "DELETE", headers: { ...headers, Prefer: "return=representation" }
      });
      return res.status(response.status).send(await response.text());
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = { ...(req.body || {}), group_type: "code", domain: `group:${String(req.body?.id ?? id)}` };
      const response = await fetch(
        req.method === "POST" ? `${SUPABASE_URL}/rest/v1/companies` : `${SUPABASE_URL}/rest/v1/companies?id=eq.${encodeURIComponent(id)}&group_type=eq.code`,
        {
          method: req.method === "POST" ? "POST" : "PATCH",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify(body)
        }
      );
      return res.status(response.status).send(await response.text());
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Server error" });
  }
}

