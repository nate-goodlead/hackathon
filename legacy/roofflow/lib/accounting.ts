import type { CashDriver, CashEvent, CashEventType } from "../types";

type CsvRow = Record<string, string>;

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function get(row: CsvRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (row[normalized] !== undefined && row[normalized] !== "") {
      return row[normalized];
    }
  }
  return fallback;
}

function num(row: CsvRow, keys: string[], fallback = 0) {
  const raw = get(row, keys, String(fallback)).replace(/[€_\s]/g, "").replace(",", ".");
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Map Exact / Gilde / Yuki / Snelstart account codes and names to cash drivers. */
export function mapDriverFromAccount(
  accountCode: string,
  accountName: string,
  debitCreditHint = "",
): CashDriver {
  const code = accountCode.trim();
  const name = accountName.toLowerCase();
  const hint = debitCreditHint.toLowerCase();

  if (
    name.includes("materiaal") ||
    name.includes("material") ||
    name.includes("inkoop") ||
    name.includes("voorraad") ||
    /^4[0-4]\d{2}$/.test(code)
  ) {
    return "materials";
  }

  if (
    name.includes("onderaannemer") ||
    name.includes("subcontract") ||
    name.includes("inhuur") ||
    name.includes("freelance") ||
    name.includes("arbeid") ||
    /^4[5-9]\d{2}$/.test(code)
  ) {
    return "subcontractors";
  }

  if (
    name.includes("omzet") ||
    name.includes("verkoop") ||
    name.includes("factuur") ||
    name.includes("invoice") ||
    name.includes("milestone") ||
    name.includes("debiteur") ||
    /^8\d{3}$/.test(code)
  ) {
    return "billing";
  }

  if (hint.includes("credit") || hint.includes("bij")) return "billing";
  if (hint.includes("debit") || hint.includes("af")) return "materials";

  return "other";
}

function inferType(driver: CashDriver, amount: number): CashEventType {
  if (driver === "billing") return "inflow";
  if (driver === "materials" || driver === "subcontractors") return "outflow";
  return amount < 0 ? "outflow" : "inflow";
}

const DEMO_START = new Date("2026-06-08T00:00:00.000Z");

function weekFromDate(dateStr: string, fallbackWeek: number): number {
  if (!dateStr) return Math.min(13, Math.max(1, fallbackWeek));
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return Math.min(13, Math.max(1, fallbackWeek));
  const diffDays = Math.floor((parsed.getTime() - DEMO_START.getTime()) / (24 * 60 * 60 * 1000));
  return Math.min(13, Math.max(1, Math.floor(diffDays / 7) + 1));
}

function resolveProjectId(row: CsvRow, projects: { id: string; name: string }[]): string {
  const explicit = get(row, ["project_id", "project", "project_reference", "kostenplaats", "cost_center"], "");
  if (explicit) return explicit;

  const description = get(row, ["description", "omschrijving", "label", "memo"], "").toLowerCase();
  const match = projects.find(
    (project) =>
      description.includes(project.id.toLowerCase()) ||
      description.includes(project.name.toLowerCase()),
  );
  return match?.id ?? projects[0]?.id ?? "unassigned";
}

export function rowsToExactAccountingEvents(
  rows: CsvRow[],
  fileName: string,
  projects: { id: string; name: string }[],
): CashEvent[] {
  return rows
    .map((row, index) => {
      const accountCode = get(row, ["account_code", "grootboek", "ledger_account", "rekening"], "");
      const accountName = get(row, ["account_name", "account_description", "omschrijving_grootboek"], "");
      const debitCredit = get(row, ["debit_credit", "dc", "debet_credit"], "");
      const rawAmount = num(row, ["amount", "bedrag", "value", "debit", "credit"], 0);
      const signed = get(row, ["type"], "").toLowerCase().includes("out") ? -Math.abs(rawAmount) : rawAmount;
      const driver = mapDriverFromAccount(accountCode, accountName, debitCredit);
      const type = inferType(driver, signed);
      const amount = Math.abs(signed || rawAmount);
      const week = weekFromDate(
        get(row, ["date", "boekdatum", "booking_date", "due_date"], ""),
        num(row, ["week", "due_week"], 1),
      );
      const projectId = resolveProjectId(row, projects);
      const rowNumber = index + 2;
      const traceId = `exact-${fileName}-${rowNumber}`;

      return {
        id: get(row, ["id", "transaction_id"], traceId),
        projectId,
        week,
        type,
        driver,
        label: get(row, ["description", "omschrijving", "label"], accountName || "Exact import"),
        amount,
        sourceSystem: "exact" as const,
        sourceFile: fileName,
        sourceRow: rowNumber,
        accountCode: accountCode || "—",
        accountName: accountName || "Unmapped account",
        traceId,
      };
    })
    .filter((event) => event.amount > 0 && event.projectId !== "unassigned");
}
