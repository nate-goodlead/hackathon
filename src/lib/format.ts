export function formatEuro(value: number, compact = true): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}€${Math.round(abs / 1_000)}K`;
    return `${sign}€${Math.round(abs)}`;
  }
  return `${sign}€${abs.toLocaleString("nl-NL")}`;
}

export function euroColor(value: number): string {
  if (value > 0) return "text-accent-green";
  if (value < 0) return "text-accent-red";
  return "text-text-primary";
}

export function headroomStatus(headroom: number, threshold: number): "safe" | "warning" | "danger" {
  const ratio = headroom / threshold;
  if (ratio < 0.2) return "danger";
  if (ratio < 0.4) return "warning";
  return "safe";
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "On Track":
      return "bg-accent-green/20 text-accent-green border-accent-green/30";
    case "At Risk":
      return "bg-accent-amber/20 text-accent-amber border-accent-amber/30";
    case "Delayed":
      return "bg-accent-red/20 text-accent-red border-accent-red/30";
    default:
      return "bg-accent-slate/20 text-text-muted border-accent-slate/30";
  }
}
