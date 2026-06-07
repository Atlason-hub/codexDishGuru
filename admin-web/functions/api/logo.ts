import { json, requireSupabase, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

function getCandidateBuckets(env: Env, requestedBucket?: string) {
  const defaultBucket = env.COMPANY_LOGOS_BUCKET || "company-logos";
  return Array.from(new Set([requestedBucket, defaultBucket, "companies", "company-logos"].filter(Boolean))) as string[];
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

    return new Response(lastErrorText || "Logo not found", { status: lastStatus });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Fetch failed" }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const body = (await request.json()) as {
    companyId?: string;
    filename?: string;
    contentType?: string;
    dataBase64?: string;
  };

  const { companyId, filename, contentType, dataBase64 } = body;
  if (!companyId || !filename || !dataBase64) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  const path = `companies/${companyId}/${filename}`;

  try {
    const { supabaseUrl, serviceRole } = requireSupabase(env);
    const buffer = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0));
    let lastErrorText = "";
    let lastStatus = 500;

    for (const bucket of getCandidateBuckets(env)) {
      const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": contentType || "application/octet-stream",
          "x-upsert": "true"
        },
        body: buffer
      });

      if (!response.ok) {
        lastStatus = response.status;
        lastErrorText = await response.text();
        continue;
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
      return json({ url: publicUrl, path, bucket });
    }

    return new Response(lastErrorText || "Upload failed", { status: lastStatus });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
};
