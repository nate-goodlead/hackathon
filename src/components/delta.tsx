"use client";

import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DeltaContextValue = { value: number };
const DeltaContext = React.createContext<DeltaContextValue | null>(null);

function useDeltaValue() {
  const ctx = React.useContext(DeltaContext);
  if (!ctx) throw new Error("Delta children must be inside Delta");
  return ctx.value;
}

export function Delta({
  value,
  variant = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { value: number; variant?: "default" | "badge" }) {
  return (
    <DeltaContext.Provider value={{ value }}>
      {variant === "badge" ? (
        <Badge
          variant="secondary"
          className={cn(
            value > 0 && "bg-emerald-500/10 text-emerald-400",
            value < 0 && "bg-red-500/10 text-red-400",
            className,
          )}
          {...(props as React.ComponentProps<typeof Badge>)}
        >
          {children}
        </Badge>
      ) : (
        <div
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium",
            value > 0 && "text-emerald-400",
            value < 0 && "text-red-400",
            value === 0 && "text-muted-foreground",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      )}
    </DeltaContext.Provider>
  );
}

export function DeltaIcon({ className }: { className?: string }) {
  const value = useDeltaValue();
  if (value > 0) return <TrendingUp className={cn("size-3.5", className)} />;
  if (value < 0) return <TrendingDown className={cn("size-3.5", className)} />;
  return <Minus className={cn("size-3.5", className)} />;
}

export function DeltaValue({
  precision = 1,
  suffix = "%",
  absolute = true,
  className,
}: {
  precision?: number;
  suffix?: string;
  absolute?: boolean;
  className?: string;
}) {
  const value = useDeltaValue();
  const formatted = (absolute ? Math.abs(value) : value).toFixed(precision);
  return (
    <span className={className}>
      {value > 0 && !absolute ? "+" : ""}
      {formatted}
      {suffix}
    </span>
  );
}
