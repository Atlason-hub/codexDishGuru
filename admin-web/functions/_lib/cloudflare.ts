export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  COMPANY_LOGOS_BUCKET?: string;
  DISH_IMAGES_BUCKET?: string;
  GUEST_COMPANY_ID?: string;
  GUEST_USER_ID?: string;
}

export type AdminRole = "admin" | "viewer";

export type PagesFunction<E extends Env = Env> = (context: { env: E; request: Request }) => Response | Promise<Response>;

export function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export function requireSupabase(env: Env) {
  const supabaseUrl = env.SUPABASE_URL ?? "";
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return { supabaseUrl, serviceRole };
}

export async function fetchSupabase(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { supabaseUrl, serviceRole } = requireSupabase(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRole);
  headers.set("Authorization", `Bearer ${serviceRole}`);

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers
  });
}

export async function fetchSupabaseJson<T>(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetchSupabase(env, path, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Supabase request failed for ${path}`);
  }

  return (text ? JSON.parse(text) : null) as T;
}

export function searchParam(request: Request, key: string): string {
  return new URL(request.url).searchParams.get(key)?.trim() ?? "";
}

export async function requireAdmin(
  env: Env,
  request: Request,
  options: { write?: boolean } = {}
): Promise<{ userId: string; role: AdminRole } | Response> {
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!token) {
    return json({ error: "Authentication required" }, { status: 401 });
  }

  const { supabaseUrl, serviceRole } = requireSupabase(env);
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${token}`
    }
  });
  if (!userResponse.ok) {
    return json({ error: "Invalid or expired session" }, { status: 401 });
  }

  const user = (await userResponse.json()) as { id?: string };
  if (!user.id) {
    return json({ error: "Invalid session user" }, { status: 401 });
  }

  const rows = await fetchSupabaseJson<Array<{ role?: string | null; status?: string | null }>>(
    env,
    `admin_users?select=role,status&id=eq.${encodeURIComponent(user.id)}&limit=1`
  );
  const row = rows[0];
  const role: AdminRole | null = row?.role === "admin" || row?.role === "viewer" ? row.role : null;
  if (!role || row?.status !== "active") {
    return json({ error: "Admin access denied" }, { status: 403 });
  }
  if (options.write && role !== "admin") {
    return json({ error: "Administrator role required" }, { status: 403 });
  }

  return { userId: user.id, role };
}
