import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const url = new URL("https://www.10bis.co.il/api/CityNameAutoComplete");
  url.searchParams.set("q", q);
  url.searchParams.set("websiteID", "10bis");
  url.searchParams.set("domainID", "10bis");
  url.searchParams.set("resId", "0");

  try {
    const response = await fetch(url);
    const payload = await response.text();
    res.setHeader("Content-Type", "application/json");
    res.status(response.status).send(payload);
  } catch {
    res.status(500).json({ error: "City lookup failed" });
  }
}
