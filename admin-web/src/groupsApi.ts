import type { Group, GroupRow } from "./groupsTypes";

function normalizeLogoUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.startsWith("/api/logo?")) return rawUrl;
  const marker = "/storage/v1/object/public/";
  const index = rawUrl.indexOf(marker);
  if (index >= 0) {
    const [bucket, ...path] = rawUrl.slice(index + marker.length).split("/");
    if (bucket && path.length) {
      return `/api/logo?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path.join("/"))}`;
    }
  }
  return rawUrl;
}

function serializeLogoUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("/api/logo?")) return rawUrl;
  const params = new URLSearchParams(rawUrl.split("?")[1] ?? "");
  const bucket = params.get("bucket") ?? "company-logos";
  const path = params.get("path");
  return path ? `/storage/v1/object/public/${bucket}/${path}` : rawUrl;
}

const toGroup = (row: GroupRow): Group => ({
  id: row.id,
  groupKey: row.company_key,
  name: row.name,
  joinCode: row.join_code,
  usersCount: row.users_count ?? 0,
  createdAt: row.created_at,
  orderVendor: row.order_vendor ?? "Other",
  streetId: row.street_id ?? null,
  street: row.street,
  number: row.number,
  cityId: row.city_id,
  cityName: row.city_name,
  logoUrl: normalizeLogoUrl(row.logo_url)
});

export async function fetchGroups(): Promise<Group[]> {
  const response = await fetch("/api/groups");
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Failed to load groups");
  return (JSON.parse(text) as GroupRow[]).map(toGroup).sort((a, b) =>
    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

function payload(group: Group): GroupRow {
  return {
    id: group.id,
    company_key: group.groupKey,
    name: group.name,
    join_code: group.joinCode.trim().toUpperCase(),
    order_vendor: group.orderVendor,
    street_id: group.streetId ?? null,
    street: group.street,
    number: group.number,
    city_id: group.cityId,
    city_name: group.cityName,
    logo_url: serializeLogoUrl(group.logoUrl)
  };
}

export async function createGroup(group: Group) {
  const response = await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload(group))
  });
  if (!response.ok) throw new Error((await response.text()) || "Create group failed.");
  return fetchGroups();
}

export async function updateGroup(id: string, group: Group) {
  const body = payload(group);
  const response = await fetch(`/api/groups?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error((await response.text()) || "Update group failed.");
  return fetchGroups();
}

export async function deleteGroup(id: string) {
  const response = await fetch(`/api/groups?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Delete group failed.");
  return fetchGroups();
}

export async function uploadGroupLogo(groupId: string, file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read logo file."));
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result.split(",")[1] : "";
      result ? resolve(result) : reject(new Error("Failed to encode logo file."));
    };
    reader.readAsDataURL(file);
  });
  const extension = file.name.split(".").pop() || "png";
  const response = await fetch("/api/logo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: groupId,
      entityType: "groups",
      filename: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`,
      contentType: file.type,
      dataBase64
    })
  });
  if (!response.ok) throw new Error((await response.text()) || "Logo upload failed.");
  const result = (await response.json()) as { url?: string };
  if (!result.url) throw new Error("Logo upload failed.");
  return result.url;
}
