import { supabase } from "./supabaseClient";

export type ReportItem = {
  id: string;
  title: string;
  category: "abuse" | "performance" | "content" | "user";
  status: "open" | "in_review" | "resolved";
  created_by: string;
  created_at?: string;
};

const TABLE = "reports";

export async function fetchReports(): Promise<ReportItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportItem[];
}

export async function createReport(report: ReportItem): Promise<ReportItem[]> {
  const { error } = await supabase.from(TABLE).insert(report);
  if (error) throw new Error(error.message);
  return fetchReports();
}

export async function updateReport(
  id: string,
  updates: Partial<ReportItem>
): Promise<ReportItem[]> {
  const { error } = await supabase.from(TABLE).update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  return fetchReports();
}

export async function deleteReport(id: string): Promise<ReportItem[]> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return fetchReports();
}
