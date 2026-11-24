import { json, requireAdmin, requireSupabase, searchParam, type Env, type PagesFunction } from "../_lib/cloudflare";

function getCandidateBuckets(env: Env, requestedBucket?: string) {
  const defaultBucket = env.COMPANY_LOGOS_BUCKET || "company-logos";
  const allowed = new Set([defaultBucket, "companies", "company-logos"]);
  return Array.from(new Set([requestedBucket && allowed.has(requestedBucket) ? requestedBucket : null, defaultBucket, "companies", "company-logos"].filter(Boolean))) as string[];
}

const isSafePath = (value: string) => value.length <= 500 && !value.startsWith("/") && !value.split("/").includes("..");
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const access = await requireAdmin(env, request);
  if (access instanceof Response) return access;
  const path = searchParam(request, "path");
  const requestedBucket = searchParam(request, "bucket") || undefined;
  if (!path || !isSafePath(path)) {
    return json({ error: "Invalid path" }, { status: 400 });
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
  const access = await requireAdmin(env, request, { write: true });
  if (access instanceof Response) return access;
  const body = (await request.json()) as {
    companyId?: string;
    entityType?: string;
    filename?: string;
    contentType?: string;
    dataBase64?: string;
  };

  const { companyId, entityType, filename, contentType, dataBase64 } = body;
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const safeFilename = filename?.match(/^[a-zA-Z0-9._-]{1,120}$/) ? filename : "";
  if (!companyId || !isUuid(companyId) || !safeFilename || !dataBase64) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!contentType || !allowedTypes.has(contentType)) {
    return json({ error: "Unsupported image type" }, { status: 415 });
  }
  if (dataBase64.length > 4_200_000) {
    return json({ error: "Image is too large" }, { status: 413 });
  }

  const folder = entityType === "groups" ? "groups" : "companies";
  const path = `${folder}/${companyId}/${safeFilename}`;

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
