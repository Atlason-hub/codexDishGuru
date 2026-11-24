import { apiFetch } from "./apiClient";

export type AppErrorItem = {
  id: string;
  fingerprint: string;
  error_message: string;
  stack_trace?: string | null;
  screen?: string | null;
  action?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  group_id?: string | null;
  app_version?: string | null;
  build_version?: string | null;
  platform?: string | null;
  os_version?: string | null;
  expo_version?: string | null;
  context?: Record<string, unknown>;
  status: "new" | "investigating" | "resolved" | "ignored";
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
};

export async function fetchAppErrors(filters: { status?: string; platform?: string; search?: string } = {}) {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.platform) query.set("platform", filters.platform);
  if (filters.search) query.set("search", filters.search);
  const response = await apiFetch(`/api/app-errors?${query}`);
  if (!response.ok) throw new Error((await response.text()) || "Failed to load app errors.");
  return await response.json() as AppErrorItem[];
}

export async function updateAppErrorStatus(id: string, status: AppErrorItem["status"]) {
  const response = await apiFetch(`/api/app-errors?id=${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error((await response.text()) || "Failed to update error.");
}

export async function deleteAppError(id: string) {
  const response = await apiFetch(`/api/app-errors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete error.");
}
