const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} is not configured`);
}

function safeFilename(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 160) || "upload.bin";
}

function storageObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ detail: "Method not allowed" }, 405);

  try {
    const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = firstEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
    const bucket = Deno.env.get("SUPABASE_STORAGE_BUCKET") || "uploads";

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonResponse({ detail: "file is required" }, 400);
    }

    const uploadId = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const storagePath = `${uploadId}/${filename}`;
    const bytes = await file.arrayBuffer();

    const storageRes = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucket}/${storageObjectPath(storagePath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: bytes,
      },
    );
    if (!storageRes.ok) {
      return jsonResponse(
        { detail: `Storage upload failed: ${await storageRes.text()}` },
        storageRes.status,
      );
    }

    const batch = {
      id: uploadId,
      opco_id: String(form.get("opco_id") || "").trim() || null,
      filename,
      storage_path: storagePath,
      source_system: String(form.get("source_system") || "").trim() || null,
      status: "uploaded",
      row_count: null,
    };

    const dbRes = await fetch(`${supabaseUrl}/rest/v1/upload_batches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(batch),
    });
    if (!dbRes.ok) {
      return jsonResponse(
        { detail: `Upload batch insert failed: ${await dbRes.text()}` },
        dbRes.status,
      );
    }

    return jsonResponse({
      uploadId,
      filename,
      storagePath,
      bucket,
      status: "uploaded",
    });
  } catch (error) {
    return jsonResponse({ detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
