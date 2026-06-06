type SupabaseStagedUpload = {
  uploadId: string;
  storagePath: string;
};

export async function stageUploadWithSupabaseFunction(
  file: File,
  opts: { opcoId?: string; sourceSystem?: string },
): Promise<SupabaseStagedUpload | null> {
  const enabled = import.meta.env.VITE_USE_SUPABASE_UPLOAD_FUNCTION === "true";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!enabled || !supabaseUrl || !anonKey) return null;

  const form = new FormData();
  form.append("file", file);
  form.append("opco_id", opts.opcoId ?? "");
  form.append("source_system", opts.sourceSystem ?? "");

  const response = await fetch(`${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/upload-file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: form,
  });
  const text = await response.text();
  let data: { uploadId?: string; storagePath?: string; detail?: string };
  try {
    data = JSON.parse(text) as { uploadId?: string; storagePath?: string; detail?: string };
  } catch {
    throw new Error(text.slice(0, 160) || `Supabase upload function failed (${response.status})`);
  }
  if (!response.ok || !data.uploadId || !data.storagePath) {
    throw new Error(data.detail ?? "Supabase upload function failed");
  }
  return { uploadId: data.uploadId, storagePath: data.storagePath };
}
