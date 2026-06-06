import { CloudRain } from "lucide-react";
import { formatEuro } from "../lib/format";
import type { WipProject } from "../types";

interface Props {
  projects: WipProject[];
}

export function ProjectRiskCard({ projects }: Props) {
  const atRisk = projects.filter((p) => p.status === "At Risk" || p.status === "Delayed");

  if (atRisk.length === 0) {
    return (
      <div className="dashboard-card p-6 text-center text-text-muted">
        No projects currently at risk or delayed.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {atRisk.map((p) => (
        <div key={p.projectId} className="dashboard-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-white">{p.project}</h3>
              <p className="text-sm text-text-muted">{p.opco}</p>
            </div>
            {p.weatherRisk && (
              <CloudRain className="h-5 w-5 shrink-0 text-accent-blue" aria-label="Weather risk" />
            )}
          </div>
          <p className="mt-3 text-sm text-accent-amber">{p.riskReason}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-text-muted">Materials committed</p>
              <p className="font-mono">{formatEuro(p.materialsCommitted)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Subcontractor week</p>
              <p className="font-mono">W{p.subcontractorWeek}</p>
            </div>
          </div>
          {p.actionNeeded && (
            <p className="mt-3 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm">
              <span className="text-text-muted">Action: </span>
              {p.actionNeeded}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
