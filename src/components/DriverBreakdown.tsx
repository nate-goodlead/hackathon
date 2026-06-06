import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { formatEuro, euroColor } from "../lib/format";
import type { DriverKey, WeekForecast } from "../types";
import { DRIVER_COLORS, DRIVER_LABELS } from "../types";

interface Props {
  weeks: WeekForecast[];
}

const DRIVERS: DriverKey[] = [
  "materials",
  "subcontractors",
  "milestoneBilling",
  "paymentLag",
  "weatherImpact",
];

export function DriverBreakdown({ weeks }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {DRIVERS.map((driver) => {
        const total = weeks.reduce((sum, w) => sum + w[driver], 0);
        const spark = weeks.map((w) => ({ v: w[driver] / 1000 }));
        const firstHalf = weeks.slice(0, 6).reduce((s, w) => s + w[driver], 0);
        const secondHalf = weeks.slice(7).reduce((s, w) => s + w[driver], 0);
        const trending = secondHalf >= firstHalf;

        return (
          <div key={driver} className="dashboard-card p-4">
            <p className="text-xs text-text-muted">{DRIVER_LABELS[driver]}</p>
            <div className="mt-1 flex items-center gap-2">
              <p className={`font-mono text-xl font-semibold ${euroColor(total)}`}>
                {formatEuro(total)}
              </p>
              {trending ? (
                <TrendingUp className="h-4 w-4 text-accent-green" aria-hidden />
              ) : (
                <TrendingDown className="h-4 w-4 text-accent-red" aria-hidden />
              )}
            </div>
            <div className="mt-3 h-10" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={DRIVER_COLORS[driver]}
                    fill={DRIVER_COLORS[driver]}
                    fillOpacity={0.15}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
