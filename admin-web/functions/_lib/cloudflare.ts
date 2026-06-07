export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  COMPANY_LOGOS_BUCKET?: string;
  GUEST_COMPANY_ID?: string;
  GUEST_USER_ID?: string;
}

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
