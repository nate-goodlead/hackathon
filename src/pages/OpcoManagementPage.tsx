import { useState } from "react";
import { Building2, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useOpcos, type OpcoFormData, type OpcoProfile } from "../hooks/useOpcos";

const EMPTY_FORM: OpcoFormData = {
  name: "",
  city: "",
  region: "",
  lat: 52.37,
  lng: 4.9,
  sourceSystem: "",
  dataFolder: "",
  notes: "",
};

export function OpcoManagementPage() {
  const { opcos, loading, error, createOpco, deactivateOpco } = useOpcos();
  const [form, setForm] = useState<OpcoFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await createOpco(form);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create opco");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Operating Companies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage opco profiles used for dataset assignment, weather geocoding, and cash-flow grouping.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" />
              Create opco profile
            </CardTitle>
            <CardDescription>
              New opcos appear in the upload dropdown and weather fetch targets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <FormField label="Company name" required>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="City" required>
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    required
                  />
                </FormField>
                <FormField label="Region">
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                  />
                </FormField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Latitude" required>
                  <input
                    type="number"
                    step="any"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.lat}
                    onChange={(e) => setForm({ ...form, lat: parseFloat(e.target.value) })}
                    required
                  />
                </FormField>
                <FormField label="Longitude" required>
                  <input
                    type="number"
                    step="any"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={form.lng}
                    onChange={(e) => setForm({ ...form, lng: parseFloat(e.target.value) })}
                    required
                  />
                </FormField>
              </div>
              <FormField label="Source system">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Exact, Yuki, Gilde…"
                  value={form.sourceSystem}
                  onChange={(e) => setForm({ ...form, sourceSystem: e.target.value })}
                />
              </FormField>
              <FormField label="Data folder hint">
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="portfolio company data"
                  value={form.dataFolder}
                  onChange={(e) => setForm({ ...form, dataFolder: e.target.value })}
                />
              </FormField>
              <FormField label="Notes">
                <textarea
                  className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </FormField>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : "Create opco"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4" />
              Active opcos ({opcos.length})
            </CardTitle>
            <CardDescription>Registered operating companies in Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && opcos.length === 0 && (
              <p className="text-sm text-muted-foreground">No opcos yet — create one or run migrations.</p>
            )}
            {opcos.map((opco) => (
              <OpcoCard key={opco.id} opco={opco} onDeactivate={deactivateOpco} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OpcoCard({ opco, onDeactivate }: { opco: OpcoProfile; onDeactivate: (id: string) => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{opco.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {opco.city}
            {opco.region ? ` · ${opco.region}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`Deactivate ${opco.name}?`)) return;
            setBusy(true);
            try {
              await onDeactivate(opco.id);
            } finally {
              setBusy(false);
            }
          }}
          title="Deactivate"
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      </div>
      <Separator className="my-3" />
      <div className="flex flex-wrap gap-2 text-xs">
        {opco.sourceSystem && <Badge variant="outline">{opco.sourceSystem}</Badge>}
        <Badge variant="secondary">{opco.transactionCount ?? 0} transactions</Badge>
        <Badge variant="outline">{opco.slug}</Badge>
      </div>
      {opco.dataFolder && (
        <p className="mt-2 text-xs text-muted-foreground">Folder: {opco.dataFolder}</p>
      )}
      {opco.notes && <p className="mt-1 text-xs text-muted-foreground">{opco.notes}</p>}
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && " *"}
      </span>
      {children}
    </label>
  );
}
