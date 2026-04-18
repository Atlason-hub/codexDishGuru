import type { CityOption, Company, CompanyRow, StreetOption } from "./companiesTypes";


export async function fetchCompanies(): Promise<Company[]> {
  const response = await fetch(`/api/companies`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to load companies");
  }
  let rows: CompanyRow[] = [];
  try {
    rows = JSON.parse(text) as CompanyRow[];
  } catch {
    throw new Error(text || "Invalid JSON response from /api/companies");
  }
  return rows.map((row) => ({
    id: row.id,
    companyKey: row.company_key,
    name: row.name,
    domain: row.domain,
    usersCount: row.users_count ?? 0,
    orderVendor: row.order_vendor ?? "Other",
    streetId: row.street_id ?? null,
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
    company_key: company.companyKey,
    name: company.name,
    domain: company.domain,
    users_count: company.usersCount,
    order_vendor: company.orderVendor,
    street_id: company.streetId ?? null,
    street: company.street,
    number: company.number,
    city_id: company.cityId,
    city_name: company.cityName,
    logo_url: company.logoUrl ?? null
  };
  const response = await fetch(`/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Create company failed.");
  }
  return fetchCompanies();
}

export async function updateCompany(id: string, updates: Company): Promise<Company[]> {
  const payload: Partial<CompanyRow> = {
    company_key: updates.companyKey,
    name: updates.name,
    domain: updates.domain,
    users_count: updates.usersCount,
    order_vendor: updates.orderVendor,
    street_id: updates.streetId ?? null,
    street: updates.street,
    number: updates.number,
    city_id: updates.cityId,
    city_name: updates.cityName,
    logo_url: updates.logoUrl ?? null
  };
  const response = await fetch(`/api/companies?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Update company failed.");
  }
  return fetchCompanies();
}

export async function deleteCompany(id: string): Promise<Company[]> {
  const response = await fetch(`/api/companies?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Delete company failed.");
  }
  return fetchCompanies();
}

export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const fileExt = file.name.split(".").pop() || "png";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${unique}.${fileExt}`;
  const buffer = await file.arrayBuffer();
  const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  const response = await fetch(`/api/logo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      filename,
      contentType: file.type,
      dataBase64
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Logo upload failed.");
  }
  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error("Logo upload failed.");
  }
  return payload.url;
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

export async function searchStreets(
  query: string,
  parentId: number
): Promise<StreetOption[]> {
  const response = await fetch(
    `/api/streets?` +
      new URLSearchParams({
        q: query,
        parentId: String(parentId),
        websiteID: "10bis",
        domainID: "10bis",
        resId: "0"
      }).toString()
  );
  if (!response.ok) {
    throw new Error("Failed to search streets");
  }
  const payload = (await response.json()) as { Data?: StreetOption[] } | StreetOption[];
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload.Data ?? [];
}
