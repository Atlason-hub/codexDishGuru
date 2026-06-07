import { type Env, type PagesFunction } from "../_lib/cloudflare";

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const incoming = new URL(request.url);
  const q = incoming.searchParams.get("q") ?? "";
  const url = new URL("https://www.10bis.co.il/api/CityNameAutoComplete");
  url.searchParams.set("q", q);
  url.searchParams.set("websiteID", "10bis");
  url.searchParams.set("domainID", "10bis");
  url.searchParams.set("resId", "0");

  try {
    const response = await fetch(url.toString());
    return new Response(await response.text(), {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return Response.json({ error: "City lookup failed" }, { status: 500 });
  }
};
