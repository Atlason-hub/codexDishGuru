import type { VercelRequest, VercelResponse } from "@vercel/node";

export type AdminRole = "admin" | "viewer";

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
  options: { write?: boolean } = {}
): Promise<{ userId: string; role: AdminRole } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!supabaseUrl || !serviceRole) {
    res.status(500).json({ error: "Missing Supabase settings" });
    return null;
  }
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRole, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  const user = (await userResponse.json()) as { id?: string };
  if (!user.id) {
    res.status(401).json({ error: "Invalid session user" });
    return null;
  }

  const accessResponse = await fetch(
    `${supabaseUrl}/rest/v1/admin_users?select=role,status&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` } }
  );
  const rows = accessResponse.ok ? await accessResponse.json() as Array<{ role?: string; status?: string }> : [];
  const row = rows[0];
  const role: AdminRole | null = row?.role === "admin" || row?.role === "viewer" ? row.role : null;
  if (!role || row?.status !== "active") {
    res.status(403).json({ error: "Admin access denied" });
    return null;
  }
  if (options.write && role !== "admin") {
    res.status(403).json({ error: "Administrator role required" });
    return null;
  }
  return { userId: user.id, role };
}
