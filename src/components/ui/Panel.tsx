import type { ReactNode } from "react";

interface PanelProps {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}

export function Panel({ children, className = "", accent }: PanelProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-bg-secondary/80 backdrop-blur-sm ${
        accent ? "ring-1 ring-accent-copper/20" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">{eyebrow}</p>
        <h2 className="font-serif text-xl text-text-primary md:text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
