import { supabase } from "@/integrations/supabase/client";

export type ResourceType =
  | "external_link"
  | "google_drive"
  | "google_doc"
  | "google_sheet"
  | "canva"
  | "youtube"
  | "video"
  | "pdf"
  | "image"
  | "document"
  | "zip"
  | "template"
  | "other";

export const RESOURCE_TYPES: { key: ResourceType; label: string; linkOnly?: boolean }[] = [
  { key: "external_link", label: "External Link", linkOnly: true },
  { key: "google_drive", label: "Google Drive", linkOnly: true },
  { key: "google_doc", label: "Google Doc", linkOnly: true },
  { key: "google_sheet", label: "Google Sheet", linkOnly: true },
  { key: "canva", label: "Canva", linkOnly: true },
  { key: "youtube", label: "YouTube", linkOnly: true },
  { key: "video", label: "Video" },
  { key: "pdf", label: "PDF" },
  { key: "image", label: "Image" },
  { key: "document", label: "Document" },
  { key: "zip", label: "ZIP" },
  { key: "template", label: "Template" },
  { key: "other", label: "Other" },
];

export type Visibility = "admin_only" | "all_team" | "sales" | "operations" | "finance" | "media_buyer" | "custom";
export const VISIBILITY_OPTIONS: { key: Visibility; label: string }[] = [
  { key: "all_team", label: "All Team" },
  { key: "sales", label: "Sales" },
  { key: "operations", label: "Operations" },
  { key: "finance", label: "Finance" },
  { key: "media_buyer", label: "Media Buyer" },
  { key: "admin_only", label: "Admin Only" },
  { key: "custom", label: "Custom" },
];

export interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  resource_type: ResourceType;
  resource_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  thumbnail_url: string | null;
  visibility: Visibility;
  allowed_role_keys: string[];
  allowed_module_keys: string[];
  is_published: boolean;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceCategory {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

const BUCKET = "resource-library";

export async function listCategories(): Promise<ResourceCategory[]> {
  const { data, error } = await (supabase as any)
    .from("resource_library_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function listResources(opts: { includeArchived?: boolean; adminView?: boolean } = {}): Promise<ResourceItem[]> {
  let q = (supabase as any).from("resource_library_items").select("*").order("updated_at", { ascending: false });
  if (!opts.adminView) {
    q = q.eq("is_published", true).is("archived_at", null);
  } else if (!opts.includeArchived) {
    q = q.is("archived_at", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createResource(payload: Partial<ResourceItem>): Promise<ResourceItem> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await (supabase as any)
    .from("resource_library_items")
    .insert({ ...payload, created_by: u.user?.id, updated_by: u.user?.id })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateResource(id: string, patch: Partial<ResourceItem>): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await (supabase as any)
    .from("resource_library_items")
    .update({ ...patch, updated_by: u.user?.id })
    .eq("id", id);
  if (error) throw error;
}

export async function archiveResource(id: string): Promise<void> {
  await updateResource(id, { archived_at: new Date().toISOString() });
}
export async function unarchiveResource(id: string): Promise<void> {
  await updateResource(id, { archived_at: null });
}

export async function uploadResourceFile(file: File): Promise<{ path: string; size: number; mime: string; name: string }> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return { path, size: file.size, mime: file.type || "application/octet-stream", name: file.name };
}

export async function signedUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export function inferTypeFromFile(file: File): ResourceType {
  const mime = file.type;
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  if (mime.includes("zip")) return "zip";
  if (mime.includes("word") || mime.includes("document")) return "document";
  return "other";
}
