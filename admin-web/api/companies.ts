import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TABLE = "companies";
const APP_USERS_TABLE = "AppUsers";

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  const base = `${SUPABASE_URL}/rest/v1/${TABLE}`;

  try {
    if (req.method === "GET") {
      const response = await fetch(`${base}?select=*`, {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`
        }
      });
      const text = await response.text();
      if (!response.ok) {
        return res.status(response.status).send(text);
      }

      const companies = JSON.parse(text) as Array<Record<string, unknown>>;
      const usersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/${APP_USERS_TABLE}?select=company_id`,
        {
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`
          }
        }
      );
      const usersText = await usersResponse.text();
      if (!usersResponse.ok) {
        return res.status(usersResponse.status).send(usersText);
      }

      const appUsers = JSON.parse(usersText) as Array<{ company_id?: string | null }>;
      const counts = new Map<string, number>();

      for (const user of appUsers) {
        const companyId = user.company_id;
        if (!companyId) continue;
        counts.set(companyId, (counts.get(companyId) ?? 0) + 1);
      }

      const enriched = companies.map((company) => ({
        ...company,
        users_count: counts.get(String(company.id)) ?? 0
      }));

      return json(res, 200, enriched);
    }

    if (req.method === "POST") {
      const response = await fetch(base, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(req.body || {})
      });
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    if (req.method === "PUT") {
      const id = req.query.id;
      if (!id || typeof id !== "string") {
        return json(res, 400, { error: "Missing id" });
      }
      const response = await fetch(`${base}?id=eq.${id}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(req.body || {})
      });
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id || typeof id !== "string") {
        return json(res, 400, { error: "Missing id" });
      }
      const response = await fetch(`${base}?id=eq.${id}`, {
        method: "DELETE",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          Prefer: "return=representation"
        }
      });
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : "Server error" });
  }
}
