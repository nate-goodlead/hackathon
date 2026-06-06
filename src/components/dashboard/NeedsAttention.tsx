import { ChevronRight, CloudRain, AlertTriangle, FileWarning } from "lucide-react";
import type { WipProject } from "../../types";

interface Item {
  id: string;
  label: string;
  count?: number;
  icon: typeof AlertTriangle;
}

interface Props {
  projects: WipProject[];
  covenantWarning?: string | null;
}

export function NeedsAttention({ projects, covenantWarning }: Props) {
  const atRisk = projects.filter((p) => p.status === "At Risk" || p.status === "Delayed");
  const weatherRisk = projects.filter((p) => p.weatherRisk);

  const items: Item[] = [];
  if (covenantWarning) {
    items.push({ id: "covenant", label: covenantWarning, icon: FileWarning });
  }
  atRisk.slice(0, 3).forEach((p) => {
    items.push({
      id: p.projectId,
      label: `${p.project} — ${p.status}`,
      icon: AlertTriangle,
    });
  });
  if (weatherRisk.length) {
    items.push({
      id: "weather",
      label: "Weather-delayed milestones",
      count: weatherRisk.length,
      icon: CloudRain,
    });
  }

  if (!items.length) {
    items.push({ id: "ok", label: "No critical items — portfolio on track", icon: AlertTriangle });
  }

  return (
    <div className="dashboard-card p-6 animate-fade-up stagger-4">
      <h3 className="mb-4 text-sm font-medium text-text-muted">Needs attention</h3>
      <ul className="space-y-1">
        {items.map(({ id, label, count, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-bg-elevated"
            >
              <Icon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              <span className="flex-1 text-sm text-white">{label}</span>
              {count !== undefined && (
                <span className="rounded-full bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-muted">
                  {count}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-text-subtle" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
