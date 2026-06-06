import { X } from "lucide-react";
import { formatEuro, euroColor } from "../lib/format";
import type { DriverKey, TraceRecord, TraceSelection } from "../types";
import { DRIVER_LABELS, SCENARIO_LABELS } from "../types";

interface Props {
  selection: TraceSelection | null;
  traces: TraceRecord[];
  weekAmount: number;
  onClose: () => void;
}

export function TracePanel({ selection, traces, weekAmount, onClose }: Props) {
  if (!selection) return null;

  const matching = traces.filter(
    (t) =>
      t.week === selection.week &&
      t.driver === selection.driver &&
      t.scenario === selection.scenario,
  );

  const byProject = new Map<string, { name: string; amount: number; assumption: string }>();
  for (const t of matching) {
    const existing = byProject.get(t.projectId);
    if (existing) {
      existing.amount += t.amount;
    } else {
      byProject.set(t.projectId, { name: t.projectName, amount: t.amount, assumption: t.assumption });
    }
  }

  const sample = matching[0];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-bg-elevated shadow-2xl animate-fade-up"
        aria-labelledby="trace-panel-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Trace Panel</p>
            <h3 id="trace-panel-title" className="font-serif text-xl text-text-primary">
              {DRIVER_LABELS[selection.driver as DriverKey]}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Close trace panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-6 grid grid-cols-2 gap-3">
            <StatBox label="Week" value={`W${selection.week}`} />
            <StatBox label="Amount" value={formatEuro(weekAmount)} valueClass={euroColor(weekAmount)} />
            <StatBox label="Scenario" value={SCENARIO_LABELS[selection.scenario]} />
            <StatBox label="Source System" value={sample?.sourceSystem ?? "—"} />
          </div>

          {sample && (
            <div className="mb-6 rounded-lg border border-border bg-bg-elevated/50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">GL Account</p>
              <p className="mt-1 font-mono text-sm">{sample.glAccount}</p>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Assumption</p>
              <p className="mt-1 text-sm text-text-muted">{sample.assumption}</p>
            </div>
          )}

          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
            Projects Contributing
          </p>
          <div className="space-y-2">
            {Array.from(byProject.entries()).map(([id, p]) => (
              <div
                key={id}
                className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated/40 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-text-muted">{id}</p>
                </div>
                <p className={`font-mono text-sm ${euroColor(p.amount)}`}>{formatEuro(p.amount)}</p>
              </div>
            ))}
            {byProject.size === 0 && (
              <p className="text-sm text-text-muted">No project-level trace records for this selection.</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function StatBox({ label, value, valueClass = "text-text-primary" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated/40 p-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-lg ${valueClass}`}>{value}</p>
    </div>
  );
}
