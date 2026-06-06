import { TrendingDown, TrendingUp } from "lucide-react";
import { formatEuro } from "../../lib/format";

interface KpiMetricProps {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
}

export function KpiMetric({ label, value, delta, deltaLabel = "vs prior scenario" }: KpiMetricProps) {
  const positive = delta !== undefined && delta >= 0;
  const hasDelta = delta !== undefined;

  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1 px-4 first:pl-0 last:pr-0">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
      {hasDelta && (
        <p className={`flex items-center gap-1 text-xs ${positive ? "text-accent-green" : "text-accent-red"}`}>
          {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(delta).toFixed(1)}% {deltaLabel}
        </p>
      )}
    </div>
  );
}

interface KpiStripProps {
  netCash13w: number;
  headroom: number;
  atRiskCount: number;
  wetVsBaseDelta?: number;
}

export function KpiStrip({ netCash13w, headroom, atRiskCount, wetVsBaseDelta }: KpiStripProps) {
  return (
    <div className="dashboard-card mb-6 flex flex-wrap divide-x divide-border overflow-hidden animate-fade-up stagger-1">
      <div className="flex w-full flex-wrap lg:flex-nowrap">
        <KpiMetric label="13-week net cash" value={formatEuro(netCash13w)} />
        <KpiMetric
          label="Covenant headroom"
          value={formatEuro(headroom)}
          delta={wetVsBaseDelta}
          deltaLabel="wet vs base"
        />
        <KpiMetric label="Projects at risk" value={String(atRiskCount)} />
      </div>
    </div>
  );
}

export function computeNetTotal(weeks: { net: number }[]): number {
  return weeks.reduce((s, w) => s + w.net, 0);
}
