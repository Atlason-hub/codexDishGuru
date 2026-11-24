import { json, requireAdmin, type Env, type PagesFunction } from "../_lib/cloudflare";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const access = await requireAdmin(env, request);
    if (access instanceof Response) return access;
    return json({ allowed: true, role: access.role });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to check admin access" },
      { status: 500 }
    );
  }
};
