import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_USERS_TABLE = "AppUsers";

function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const companyId = typeof req.query.companyId === "string" ? req.query.companyId : "";
  if (!companyId) {
    return json(res, 400, { error: "Missing companyId" });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${APP_USERS_TABLE}?select=user_id,email&company_id=eq.${encodeURIComponent(companyId)}&order=email.asc.nullslast`,
      {
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`
        }
      }
    );

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).send(text);
    }

    const rows = (text ? JSON.parse(text) : []) as Array<{
      user_id?: string | null;
      email?: string | null;
    }>;

    return json(
      res,
      200,
      rows.map((row) => ({
        userId: row.user_id ?? null,
        email: row.email ?? null
      }))
    );
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Failed to load company users"
    });
  }
}
