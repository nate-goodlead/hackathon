# Supabase Edge Functions

## `upload-file`

Stages browser uploads in Supabase before local/Python analysis:

1. Receives multipart `file`, `opco_id`, and `source_system`.
2. Uploads the original file to Storage bucket `uploads`.
3. Creates an `upload_batches` row with status `uploaded`.
4. Returns `uploadId` and `storagePath` for `/api/upload/analyze`.

Deploy:

```bash
npx supabase functions deploy upload-file
```

Required function secrets:

```bash
npx supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_STORAGE_BUCKET=uploads
```

Frontend opt-in:

```bash
VITE_USE_SUPABASE_UPLOAD_FUNCTION=true
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```
