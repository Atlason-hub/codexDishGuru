import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const groupId = typeof req.query.groupId === "string" ? req.query.groupId : "";
  if (!groupId) return res.status(400).json({ error: "Missing groupId" });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/AppUsers?select=user_id,email&group_id=eq.${encodeURIComponent(groupId)}&order=email.asc.nullslast`,
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
  );
  return res.status(response.status).send(await response.text());
}
