export type CompanyUserItem = {
  userId: string | null;
  email: string | null;
};

export async function fetchCompanyUsers(companyId: string): Promise<CompanyUserItem[]> {
  const response = await fetch(
    `/api/company-users?companyId=${encodeURIComponent(companyId)}`
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || "Failed to load company users");
  }

  try {
    return JSON.parse(text) as CompanyUserItem[];
  } catch {
    throw new Error(text || "Invalid JSON response from /api/company-users");
  }
}
