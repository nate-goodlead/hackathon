import { Activity, Clock } from "lucide-react";

interface TopBarProps {
  roleLabel: string;
  scenarioLabel?: string;
  lastUpdated: string;
}

export function TopBar({ roleLabel, scenarioLabel, lastUpdated }: TopBarProps) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 animate-fade-up">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-copper">
          {roleLabel}
          {scenarioLabel ? ` · ${scenarioLabel}` : ""}
        </p>
        <h1 className="font-serif text-2xl text-text-primary md:text-3xl">13-Week Rolling Forecast</h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-accent-green" aria-hidden />
          Live data pipeline
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Updated {lastUpdated}
        </span>
      </div>
    </header>
  );
}
