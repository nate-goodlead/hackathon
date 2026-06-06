import { useCallback, useEffect, useState } from "react";

export interface OpcoProfile {
  id: string;
  slug: string;
  name: string;
  city: string;
  region?: string | null;
  lat: number;
  lng: number;
  sourceSystem?: string | null;
  dataFolder?: string | null;
  notes?: string | null;
  isActive: boolean;
  transactionCount?: number;
}

export interface OpcoFormData {
  name: string;
  city: string;
  region?: string;
  lat: number;
  lng: number;
  sourceSystem?: string;
  dataFolder?: string;
  notes?: string;
}

export function useOpcos() {
  const [opcos, setOpcos] = useState<OpcoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/opcos");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOpcos((data.opcos ?? []).filter((o: OpcoProfile) => o.isActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load opcos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createOpco = useCallback(async (form: OpcoFormData) => {
    const res = await fetch("/api/opcos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Create failed (${res.status})`);
    }
    await refresh();
    return res.json();
  }, [refresh]);

  const updateOpco = useCallback(async (id: string, form: Partial<OpcoFormData & { isActive?: boolean }>) => {
    const res = await fetch(`/api/opcos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error(`Update failed (${res.status})`);
    await refresh();
    return res.json();
  }, [refresh]);

  const deactivateOpco = useCallback(async (id: string) => {
    const res = await fetch(`/api/opcos/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Deactivate failed (${res.status})`);
    await refresh();
  }, [refresh]);

  return { opcos, loading, error, refresh, createOpco, updateOpco, deactivateOpco };
}
