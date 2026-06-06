import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekForecast } from "../../types";
import { formatEuro } from "../../lib/format";

interface Props {
  weeks: WeekForecast[];
  title?: string;
}

export function NetCashChart({ weeks, title = "Net cash flow" }: Props) {
  const data = weeks.map((w) => ({
    label: w.label,
    net: w.net / 1000,
    cumulative: weeks
      .filter((x) => x.week <= w.week)
      .reduce((s, x) => s + x.net, 0) / 1000,
  }));

  const total = weeks.reduce((s, w) => s + w.net, 0);
  const firstHalf = weeks.slice(0, 6).reduce((s, w) => s + w.net, 0);
  const secondHalf = weeks.slice(6).reduce((s, w) => s + w.net, 0);
  const trendPct = firstHalf !== 0 ? ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100 : 0;
  const trendUp = trendPct >= 0;

  return (
    <div className="dashboard-card flex min-h-[320px] flex-col p-6 animate-fade-up stagger-2">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-4xl font-semibold tracking-tight text-white">{formatEuro(total)}</p>
          <p className="mt-1 text-sm text-text-muted">{title}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            trendUp ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
          }`}
        >
          {trendUp ? "+" : ""}
          {trendPct.toFixed(1)}% second half vs first
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} strokeDasharray="4 4" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(v) => `€${v}K`}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#141414",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              fontSize: 12,
            }}
            formatter={(v, name) => [`€${Number(v ?? 0).toFixed(0)}K`, String(name ?? "Net")]}
          />
          <Area
            type="monotone"
            dataKey="net"
            stroke="#ffffff"
            strokeWidth={2}
            fill="url(#netGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#fff", stroke: "#000", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
