import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DriverKey, ScenarioId, TraceSelection, WeekForecast } from "../types";
import { DRIVER_COLORS, DRIVER_LABELS } from "../types";

interface Props {
  weeks: WeekForecast[];
  scenario: ScenarioId;
  onBarClick: (selection: TraceSelection) => void;
}

const DRIVERS: DriverKey[] = [
  "materials",
  "subcontractors",
  "milestoneBilling",
  "paymentLag",
  "weatherImpact",
];

export function CashFlowChart({ weeks, scenario, onBarClick }: Props) {
  const chartData = weeks.map((w) => ({
    ...w,
    materialsK: w.materials / 1000,
    subcontractorsK: w.subcontractors / 1000,
    milestoneBillingK: w.milestoneBilling / 1000,
    paymentLagK: w.paymentLag / 1000,
    weatherImpactK: w.weatherImpact / 1000,
    netK: w.net / 1000,
  }));

  function handleClick(data: Record<string, unknown> | undefined, driver: DriverKey) {
    if (!data || typeof data.week !== "number") return;
    onBarClick({ week: data.week as number, driver, scenario });
  }

  return (
    <Card className="ring-1 ring-border/60">
      <CardHeader>
        <CardTitle className="text-base">5-driver cash model</CardTitle>
        <CardDescription>Click any segment to open trace panel</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#6b7280" tick={{ fontSize: 11 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              stroke="#6b7280"
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickFormatter={(v) => `€${v}K`}
            />
            <Tooltip
              contentStyle={{
                background: "#141414",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 12,
              }}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              formatter={(value, name) => [`€${Number(value ?? 0).toFixed(0)}K`, String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12, color: "#9ca3af" }} />
            {DRIVERS.map((driver) => (
              <Bar
                key={driver}
                dataKey={`${driver}K`}
                name={DRIVER_LABELS[driver]}
                stackId="drivers"
                fill={DRIVER_COLORS[driver]}
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(data) => handleClick(data as unknown as Record<string, unknown>, driver)}
              />
            ))}
            <Line
              type="monotone"
              dataKey="netK"
              name="Net Cash"
              stroke="#ffffff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#fff" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
