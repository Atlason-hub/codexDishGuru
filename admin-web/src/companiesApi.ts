import type { CityOption, Company, CompanyRow } from "./companiesTypes";
import { supabase } from "./supabaseClient";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

const TABLE = "companies";
const BUCKET = "company-logos";

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as CompanyRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    street: row.street,
    number: row.number,
    cityId: row.city_id,
    cityName: row.city_name,
    logoUrl: row.logo_url ?? undefined
  }));
}

export async function createCompany(company: Company): Promise<Company[]> {
  const payload: CompanyRow = {
    id: company.id,
    name: company.name,
    domain: company.domain,
    street: company.street,
    number: company.number,
    city_id: company.cityId,
    city_name: company.cityName,
    logo_url: company.logoUrl ?? null
  };
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase env vars missing.");
  }
  if (!token) {
    throw new Error("No auth session token.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Supabase insert failed.");
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Create company timed out. Check Supabase settings/RLS.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
  return fetchCompanies();
}

export async function updateCompany(id: string, updates: Company): Promise<Company[]> {
  const payload: Partial<CompanyRow> = {
    name: updates.name,
    domain: updates.domain,
    street: updates.street,
    number: updates.number,
    city_id: updates.cityId,
    city_name: updates.cityName,
    logo_url: updates.logoUrl ?? null
  };
  const { error } = await supabase.from(TABLE).update(payload).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  return fetchCompanies();
}

export async function deleteCompany(id: string): Promise<Company[]> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  return fetchCompanies();
}

export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const fileExt = file.name.split(".").pop() || "png";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `companies/${companyId}/${unique}.${fileExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type
  });
  if (error) {
    throw new Error(error.message);
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function searchCities(query: string): Promise<CityOption[]> {
  const response = await fetch(
    `/api/cities?` +
      new URLSearchParams({
        q: query,
        websiteID: "10bis",
        domainID: "10bis",
        resId: "0"
      }).toString()
  );
  if (!response.ok) {
    throw new Error("Failed to search cities");
  }
  const payload = (await response.json()) as { Data?: CityOption[] } | CityOption[];
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload.Data ?? [];
}
