import { supabase } from "./supabaseClient";

export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "viewer";
  status: "active" | "disabled";
  created_at?: string;
};

const TABLE = "admin_users";

export async function fetchUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
}

export async function createUser(user: AdminUser): Promise<AdminUser[]> {
  const { error } = await supabase.from(TABLE).insert(user);
  if (error) throw new Error(error.message);
  return fetchUsers();
}

export async function updateUser(id: string, updates: Partial<AdminUser>): Promise<AdminUser[]> {
  const { error } = await supabase.from(TABLE).update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  return fetchUsers();
}

export async function deleteUser(id: string): Promise<AdminUser[]> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return fetchUsers();
}
