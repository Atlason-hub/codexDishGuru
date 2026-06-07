import { json, requireSupabase, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

function getCandidateBuckets(env: Env, requestedBucket?: string) {
  const defaultBucket = (env as Env & { DISH_IMAGES_BUCKET?: string }).DISH_IMAGES_BUCKET || "dish-images";
  return Array.from(new Set([requestedBucket, defaultBucket, "dish-images"].filter(Boolean))) as string[];
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const path = searchParam(request, "path");
  const requestedBucket = searchParam(request, "bucket") || undefined;
  if (!path) {
    return json({ error: "Missing path" }, { status: 400 });
  }

  try {
    const { supabaseUrl, serviceRole } = requireSupabase(env);
    let lastErrorText = "";
    let lastStatus = 404;

    for (const bucket of getCandidateBuckets(env, requestedBucket)) {
      const url = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${path}`;
      const response = await fetch(url, {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`
        }
      });
      if (!response.ok) {
        lastStatus = response.status;
        lastErrorText = await response.text();
        continue;
      }

      return new Response(await response.arrayBuffer(), {
        status: 200,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/octet-stream"
        }
      });
    }

    return new Response(lastErrorText || "Image not found", { status: lastStatus });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Fetch failed" }, { status: 500 });
  }
};
