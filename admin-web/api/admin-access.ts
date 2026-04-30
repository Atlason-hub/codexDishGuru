import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_USERS_TABLE = "admin_users";

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

  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email) {
    return json(res, 400, { error: "Missing email" });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${ADMIN_USERS_TABLE}?select=role,status,email&email=eq.${encodeURIComponent(email)}&limit=1`,
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
      role?: string | null;
      status?: string | null;
      email?: string | null;
    }>;

    const row = rows[0];
    const role = row?.role === "admin" || row?.role === "viewer" ? row.role : null;
    const allowed = Boolean(role) && row?.status === "active";

    return json(res, 200, {
      allowed,
      role
    });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Failed to check admin access"
    });
  }
}
