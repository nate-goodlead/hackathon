import { ProjectRiskCard } from "../components/ProjectRiskCard";
import { WIPTable } from "../components/WIPTable";
import { WeatherBarsWidget } from "../components/dashboard/WeatherBarsWidget";
import { formatEuro } from "../lib/format";
import type { WeatherInsights, WipProject } from "../types";

interface Props {
  projects: WipProject[];
  weatherInsights: WeatherInsights | null;
}

export function OpcoMDDashboard({ projects, weatherInsights }: Props) {
  const totalWip = projects.reduce((s, p) => s + p.wipToDate, 0);
  const atRiskCount = projects.filter((p) => p.status === "At Risk" || p.status === "Delayed").length;
  const nextMilestone = projects
    .filter((p) => p.status !== "Not Started")
    .sort((a, b) => a.subcontractorWeek - b.subcontractorWeek)[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-card flex flex-wrap divide-x divide-border-strong overflow-hidden">
        <KpiCard label="Total WIP exposure" value={formatEuro(totalWip)} />
        <KpiCard
          label="Projects at risk"
          value={String(atRiskCount)}
          accent={atRiskCount > 0 ? "amber" : "green"}
        />
        <KpiCard
          label="Next milestone"
          value={nextMilestone ? `${nextMilestone.project} — W${nextMilestone.subcontractorWeek}` : "—"}
          small
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-text-muted">WIP exposure by project</h2>
          <WIPTable projects={projects} />
        </div>
        <WeatherBarsWidget insights={weatherInsights} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-text-muted">At-risk & delayed projects</h2>
        <ProjectRiskCard projects={projects} />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: "amber" | "green";
  small?: boolean;
}) {
  const valueColor =
    accent === "amber" ? "text-accent-amber" : accent === "green" ? "text-accent-green" : "text-white";

  return (
    <div className="min-w-[160px] flex-1 px-6 py-5">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${small ? "text-base" : "text-2xl"} ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}
