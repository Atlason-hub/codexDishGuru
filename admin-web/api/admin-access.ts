import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_auth";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
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

  try {
    const access = await requireAdmin(req, res);
    if (!access) return;
    return json(res, 200, { allowed: true, role: access.role });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Failed to check admin access"
    });
  }
}
