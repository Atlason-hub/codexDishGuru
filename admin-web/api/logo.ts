import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin } from "./_auth";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEFAULT_BUCKET = process.env.COMPANY_LOGOS_BUCKET || "company-logos";

function getCandidateBuckets(requestedBucket?: string) {
  const allowed = new Set([DEFAULT_BUCKET, "companies", "company-logos"]);
  return Array.from(
    new Set([requestedBucket && allowed.has(requestedBucket) ? requestedBucket : null, DEFAULT_BUCKET, "companies", "company-logos"].filter(Boolean))
  ) as string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (!await requireAdmin(req, res, { write: req.method === "POST" })) return;
  if (req.method === "GET") {
    const path = typeof req.query.path === "string" ? req.query.path : "";
    const requestedBucket = typeof req.query.bucket === "string" ? req.query.bucket : undefined;
    if (!path || path.length > 500 || path.startsWith("/") || path.split("/").includes("..")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    try {
      let lastErrorText = "";
      let lastStatus = 404;

      for (const bucket of getCandidateBuckets(requestedBucket)) {
        const url = `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}`;
        const response = await fetch(url, {
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`
          }
        });
        if (!response.ok) {
          lastStatus = response.status;
          lastErrorText = await response.text();
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader(
          "Content-Type",
          response.headers.get("Content-Type") || "application/octet-stream"
        );
        return res.status(200).send(buffer);
      }

      return res.status(lastStatus).send(lastErrorText || "Logo not found");
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Fetch failed" });
    }
  }

  if (req.method === "POST") {
    const { companyId, entityType, filename, contentType, dataBase64 } = req.body || {};
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    const safeFilename = typeof filename === "string" && /^[a-zA-Z0-9._-]{1,120}$/.test(filename) ? filename : "";
    const isUuid = typeof companyId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId);
    if (!isUuid || !safeFilename || typeof dataBase64 !== "string") {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (typeof contentType !== "string" || !allowedTypes.has(contentType)) {
      return res.status(415).json({ error: "Unsupported image type" });
    }
    if (dataBase64.length > 4_200_000) {
      return res.status(413).json({ error: "Image is too large" });
    }

    const folder = entityType === "groups" ? "groups" : "companies";
    const path = `${folder}/${companyId}/${safeFilename}`;
    const buffer = Buffer.from(dataBase64, "base64");

    try {
      let lastErrorText = "";
      let lastStatus = 500;

      for (const bucket of getCandidateBuckets()) {
        const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`,
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

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
        return res.status(200).json({ url: publicUrl, path, bucket });
      }

      return res.status(lastStatus).send(lastErrorText || "Upload failed");
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
