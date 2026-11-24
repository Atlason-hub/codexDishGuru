import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_auth";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statuses = new Set(["new", "investigating", "resolved", "ignored"]);
const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!await requireAdmin(req, res, { write: req.method === "PATCH" || req.method === "DELETE" })) return;
  if (req.method === "GET") {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const platform = typeof req.query.platform === "string" ? req.query.platform : "";
    const filters = ["select=*", "order=last_seen_at.desc", "limit=200"];
    if (status && statuses.has(status)) filters.push(`status=eq.${encodeURIComponent(status)}`);
    if (platform) filters.push(`platform=eq.${encodeURIComponent(platform)}`);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_errors?${filters.join("&")}`, { headers });
    return res.status(response.status).send(await response.text());
  }
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) return res.status(400).json({ error: "Missing error id" });
  if (req.method === "PATCH") {
    const status = req.body?.status;
    if (!statuses.has(status)) return res.status(400).json({ error: "Invalid status" });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_errors?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ status })
    });
    return res.status(response.status).send(await response.text());
  }
  if (req.method === "DELETE") {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/app_errors?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers });
    return res.status(response.status).send(await response.text());
  }
  return res.status(405).json({ error: "Method not allowed" });
}
