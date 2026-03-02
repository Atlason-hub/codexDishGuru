import type { CityOption, Company, CompanyRow } from "./companiesTypes";
import { supabase } from "./supabaseClient";

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
  const { error } = await supabase.from(TABLE).insert(payload);
  if (error) {
    throw new Error(error.message);
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
  const path = `companies/${companyId}/logo.${fileExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
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
