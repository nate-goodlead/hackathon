import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatEuro, statusBadgeClass } from "../lib/format";
import type { WipProject } from "../types";

type SortKey = keyof Pick<
  WipProject,
  "project" | "opco" | "contractValue" | "wipToDate" | "pctComplete" | "nextMilestone" | "status"
>;

interface Props {
  projects: WipProject[];
}

export function WIPTable({ projects }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const statusOrder = { Delayed: 0, "At Risk": 1, "On Track": 2, "Not Started": 3 };
    return [...projects].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "status") {
        cmp = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      } else if (sortKey === "pctComplete") {
        cmp = a.pctComplete - b.pctComplete;
      } else if (sortKey === "contractValue" || sortKey === "wipToDate") {
        cmp = a[sortKey] - b[sortKey];
      } else {
        cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      return asc ? cmp : -cmp;
    });
  }, [projects, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return asc ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />;
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: "project", label: "Project" },
    { key: "opco", label: "Opco" },
    { key: "contractValue", label: "Contract Value" },
    { key: "wipToDate", label: "WIP to Date" },
    { key: "pctComplete", label: "% Complete" },
    { key: "nextMilestone", label: "Next Milestone" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="dashboard-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated/40 text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted">
              {cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="cursor-pointer px-4 py-3 transition-colors hover:text-text-primary"
                  onClick={() => toggleSort(c.key)}
                  aria-sort={sortKey === c.key ? (asc ? "ascending" : "descending") : "none"}
                >
                  {c.label} <SortIcon col={c.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.projectId}
                className="border-b border-border/60 transition-colors hover:bg-bg-elevated/30"
              >
                <td className="px-4 py-3 font-medium">{p.project}</td>
                <td className="px-4 py-3 text-text-muted">{p.opco}</td>
                <td className="px-4 py-3 font-mono">{formatEuro(p.contractValue)}</td>
                <td className="px-4 py-3 font-mono">{formatEuro(p.wipToDate)}</td>
                <td className="px-4 py-3 font-mono">{p.pctComplete}%</td>
                <td className="px-4 py-3">{p.nextMilestone}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
