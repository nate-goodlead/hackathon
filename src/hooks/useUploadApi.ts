import { useCallback, useEffect, useState } from "react";
import type { UploadAnalysis, UnifiedStats } from "../types/upload";
import { stageUploadWithSupabaseFunction } from "../lib/supabaseUploadFunction";

type ConfirmUploadResult = {
  rowsAdded: number;
  totalRows: number;
  rowsAddedByStore?: Record<string, number>;
};

export function useUploadApi() {
  const [aiAvailable, setAiAvailable] = useState(false);
  const [stats, setStats] = useState<UnifiedStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const r = await fetch("/api/unified/stats");
      if (r.ok) setStats(await r.json());
    } catch {
      /* API may be offline */
    }
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setAiAvailable(d.aiAvailable))
      .catch(() => setAiAvailable(false));
    refreshStats();
  }, [refreshStats]);

  async function analyzeFile(
    file: File,
    opts: { opcoId?: string; opco?: string; city?: string; sourceSystem?: string; useAi?: boolean },
  ): Promise<UploadAnalysis> {
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("opco_id", opts.opcoId ?? "");
    form.append("opco", opts.opco ?? "");
    form.append("city", opts.city ?? "");
    form.append("source_system", opts.sourceSystem ?? "");
    form.append("use_ai", String(opts.useAi ?? true));

    try {
      const staged = await stageUploadWithSupabaseFunction(file, {
        opcoId: opts.opcoId,
        sourceSystem: opts.sourceSystem,
      }).catch((e) => {
        console.warn("Supabase upload function unavailable; falling back to local upload API.", e);
        return null;
      });
      if (staged) {
        form.append("supabase_upload_id", staged.uploadId);
        form.append("supabase_storage_path", staged.storagePath);
      }
      const r = await fetch("/api/upload/analyze", { method: "POST", body: form });
      const text = await r.text();
      let data: UploadAnalysis & { detail?: string };
      try {
        data = JSON.parse(text) as UploadAnalysis & { detail?: string };
      } catch {
        throw new Error(
          r.ok ? "Invalid response from upload API" : text.slice(0, 120) || `Upload failed (${r.status})`,
        );
      }
      if (!r.ok) throw new Error(data.detail ?? "Upload failed");
      return data as UploadAnalysis;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function confirmUpload(
    uploadId: string,
    payload: {
      columnMapping: UploadAnalysis["columnMapping"];
      glSuggestions: UploadAnalysis["glSuggestions"];
      opcoId: string;
      opco?: string;
      city?: string;
      sourceSystem?: string;
    },
  ): Promise<ConfirmUploadResult> {
    setLoading(true);
    setError(null);
    const glApprovals: Record<string, string> = {};
    for (const s of payload.glSuggestions) {
      if (s.status === "approved") glApprovals[s.glAccount] = s.suggestedCategory;
    }

    try {
      const r = await fetch(`/api/upload/${uploadId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnMapping: payload.columnMapping,
          glSuggestions: payload.glSuggestions,
          glApprovals,
          opcoId: payload.opcoId,
          opco: payload.opco,
          city: payload.city,
          sourceSystem: payload.sourceSystem,
        }),
      });
      const text = await r.text();
      let data: { detail?: string | { msg?: string }[] } & Record<string, unknown>;
      try {
        data = JSON.parse(text) as { detail?: string | { msg?: string }[] } & Record<string, unknown>;
      } catch {
        throw new Error(
          r.ok ? "Invalid response from upload API" : text.slice(0, 160) || `Confirm failed (${r.status})`,
        );
      }
      if (!r.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : Array.isArray(data.detail)
              ? data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
              : "Confirm failed";
        throw new Error(detail || "Confirm failed");
      }
      await refreshStats();
      return data as ConfirmUploadResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Confirm failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { aiAvailable, stats, loading, error, analyzeFile, confirmUpload, refreshStats };
}
