import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEFAULT_BUCKET = process.env.COMPANY_LOGOS_BUCKET || "company-logos";

function getCandidateBuckets(requestedBucket?: string) {
  return Array.from(
    new Set([requestedBucket, DEFAULT_BUCKET, "companies", "company-logos"].filter(Boolean))
  ) as string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
  }
  if (req.method === "GET") {
    const path = typeof req.query.path === "string" ? req.query.path : "";
    const requestedBucket = typeof req.query.bucket === "string" ? req.query.bucket : undefined;
    if (!path) {
      return res.status(400).json({ error: "Missing path" });
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
    const { companyId, filename, contentType, dataBase64 } = req.body || {};
    if (!companyId || !filename || !dataBase64) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const path = `companies/${companyId}/${filename}`;
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
