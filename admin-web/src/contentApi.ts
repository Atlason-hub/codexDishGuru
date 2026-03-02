import { supabase } from "./supabaseClient";

export type ContentItem = {
  id: string;
  title: string;
  type: "post" | "review" | "recipe";
  status: "draft" | "published" | "archived";
  author: string;
  created_at?: string;
};

const TABLE = "content_items";

export async function fetchContent(): Promise<ContentItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentItem[];
}

export async function createContent(item: ContentItem): Promise<ContentItem[]> {
  const { error } = await supabase.from(TABLE).insert(item);
  if (error) throw new Error(error.message);
  return fetchContent();
}

export async function updateContent(
  id: string,
  updates: Partial<ContentItem>
): Promise<ContentItem[]> {
  const { error } = await supabase.from(TABLE).update(updates).eq("id", id);
  if (error) throw new Error(error.message);
  return fetchContent();
}

export async function deleteContent(id: string): Promise<ContentItem[]> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return fetchContent();
}
