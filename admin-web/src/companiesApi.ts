import type { CityOption, Company, CompanyRow, StreetOption } from "./companiesTypes";

function unwrapLogoReference(rawUrl: string): { bucket?: string; path: string } | null {
  if (!rawUrl.startsWith("/api/logo?")) return null;

  let current = rawUrl;

  for (let i = 0; i < 5; i += 1) {
    const query = current.split("?")[1];
    if (!query) return null;
    const params = new URLSearchParams(query);
    const pathValue = params.get("path");
    const bucketValue = params.get("bucket") ?? undefined;
    if (!pathValue) return null;
    if (!pathValue.startsWith("api/logo?")) {
      return { bucket: bucketValue, path: pathValue };
    }
    current = `/${pathValue}`;
  }

  return null;
}

function normalizeLogoUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("/api/logo?")) {
    const unwrapped = unwrapLogoReference(rawUrl);
    if (unwrapped) {
      const params = new URLSearchParams({ path: unwrapped.path });
      if (unwrapped.bucket) {
        params.set("bucket", unwrapped.bucket);
      }
      return `/api/logo?${params.toString()}`;
    }
    return rawUrl;
  }

  const publicMarker = "/storage/v1/object/public/";
  const publicIndex = rawUrl.indexOf(publicMarker);
  if (publicIndex !== -1) {
    const tail = rawUrl.slice(publicIndex + publicMarker.length);
    const segments = tail.split("/");
    const bucket = segments[0];
    const path = segments.slice(1).join("/");
    if (bucket && path) {
      return `/api/logo?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`;
    }
  }

  if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://") && !rawUrl.startsWith("data:")) {
    const normalizedPath = rawUrl.startsWith("/") ? rawUrl.slice(1) : rawUrl;
    if (normalizedPath) {
      return `/api/logo?path=${encodeURIComponent(normalizedPath)}`;
    }
  }

  return rawUrl;
}

function serializeLogoUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  if (rawUrl.startsWith("data:")) return rawUrl;

  const unwrapped = unwrapLogoReference(rawUrl);
  if (unwrapped) {
    const bucket = unwrapped.bucket ?? "company-logos";
    return `/storage/v1/object/public/${bucket}/${unwrapped.path}`;
  }

  return rawUrl;
}


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
  return rows
    .map((row) => ({
      id: row.id,
      companyKey: row.company_key,
      name: row.name,
      domain: row.domain,
      usersCount: row.users_count ?? 0,
      createdAt: row.created_at,
      orderVendor: row.order_vendor ?? "Other",
      streetId: row.street_id ?? null,
      street: row.street,
      number: row.number,
      cityId: row.city_id,
      cityName: row.city_name,
      logoUrl: normalizeLogoUrl(row.logo_url)
    }))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

export async function createCompany(company: Company): Promise<Company[]> {
  const payload: CompanyRow = {
    id: company.id,
    company_key: company.companyKey,
    name: company.name,
    domain: company.domain,
    order_vendor: company.orderVendor,
    street_id: company.streetId ?? null,
    street: company.street,
    number: company.number,
    city_id: company.cityId,
    city_name: company.cityName,
    logo_url: serializeLogoUrl(company.logoUrl)
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
    order_vendor: updates.orderVendor,
    street_id: updates.streetId ?? null,
    street: updates.street,
    number: updates.number,
    city_id: updates.cityId,
    city_name: updates.cityName,
    logo_url: serializeLogoUrl(updates.logoUrl)
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
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read logo file."));
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to encode logo file."));
        return;
      }
      const parts = reader.result.split(",");
      if (parts.length < 2 || !parts[1]) {
        reject(new Error("Failed to parse logo file."));
        return;
      }
      resolve(parts[1]);
    };
    reader.readAsDataURL(file);
  });

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
  const payload = (await response.json()) as { url?: string; path?: string; bucket?: string };
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
