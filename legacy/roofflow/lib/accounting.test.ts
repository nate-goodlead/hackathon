import { describe, expect, it } from "vitest";
import { mapDriverFromAccount, rowsToExactAccountingEvents } from "./accounting";

describe("accounting mapper", () => {
  it("maps Exact-style account codes to drivers", () => {
    expect(mapDriverFromAccount("4100", "Materials purchase")).toBe("materials");
    expect(mapDriverFromAccount("4600", "Subcontractor costs")).toBe("subcontractors");
    expect(mapDriverFromAccount("8000", "Milestone revenue")).toBe("billing");
  });

  it("creates traceable cash events from accounting rows", () => {
    const events = rowsToExactAccountingEvents(
      [
        {
          account_code: "8000",
          account_name: "Milestone revenue",
          amount: "125000",
          date: "2026-06-15",
          project_reference: "P-1001",
          description: "Watertight gate",
        },
      ],
      "exact-demo.csv",
      [{ id: "P-1001", name: "Amsterdam hospital membrane renewal" }],
    );

    expect(events).toHaveLength(1);
    expect(events[0].driver).toBe("billing");
    expect(events[0].sourceSystem).toBe("exact");
    expect(events[0].traceId).toContain("exact-demo.csv");
  });
});
