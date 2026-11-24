import { supabase } from "./supabaseClient";

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your admin session has expired. Please sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

export async function fetchProtectedAssetUrl(path: string): Promise<string> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error((await response.text()) || "Failed to load protected asset.");
  }
  return URL.createObjectURL(await response.blob());
}
