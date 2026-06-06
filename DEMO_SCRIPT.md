# Altis Groep — Demo Script (6–8 minutes)

## Opening (30 seconds)

> "Altis Groep runs four operating companies across the Netherlands. Every Monday the CFO opens a spreadsheet. We built the tool that replaces it."

---

## CFO Dashboard Walkthrough (3 minutes)

1. **Show the 13-week forecast chart**
   - Point out the five driver streams: Materials Outflows, Subcontractor Payments, Milestone Billing, Customer Payment Lag, Weather Impact
   - Note the net cash line overlay

2. **Toggle to Wet Quarter**
   - Say: *"Watch what happens to Weeks 2, 3, and 4 — milestone billing shifts right because rain delays push project completion."*
   - Show covenant meter turning amber/red

3. **Point to the covenant meter**
   - Say: *"In a wet quarter, we approach the covenant threshold in Week 3. The CFO sees this on Monday, not after the board meeting."*
   - Reference ICR: 2.4× vs 2.0× minimum

4. **Click one bar segment (Trace Panel)**
   - Pick Week 2 or 3, Materials or Milestone Billing driver
   - Say: *"Click any number and the system shows exactly which projects, which GL accounts, and which assumption produced it. Full auditability."*
   - Walk through: source system, GL account, project contributions, scenario assumption

5. **Driver breakdown cards**
   - Briefly note 13-week totals and trend direction per driver

---

## Opco MD Dashboard Walkthrough (2 minutes)

1. **Switch role to Opco MD**

2. **Show the WIP table**
   - Point to **Rotterdam Warehousing** — At Risk badge
   - Sort by status or % complete

3. **Project risk card**
   - Say: *"Rotterdam Warehousing is at risk because rain in Week 2 and 3 pushed the membrane milestone to Week 5. The MD sees this before the subcontractor shows up to a delayed site."*
   - Point to weather icon, materials committed, action needed

---

## Closing (30 seconds)

> "Every number on screen is traceable to source data. A controller can open this Monday morning and know exactly why the forecast changed from last week — without asking the finance team."

---

## Likely Judge Questions

| Question | Answer |
|----------|--------|
| How does weather affect the numbers? | Rain >5mm or frost <0°C adds delay days; each delay day pushes milestone billing one week forward. Materials outflows stay in the original week, creating a cash gap. |
| How do you reconcile four accounting systems? | Gilde, Yuki, and Exact are normalized to one schema via `ingest.py` with GL mapping. Duplicates removed; unmapped accounts flagged. |
| Is the covenant calculation correct? | Headroom = threshold − projected net debt increase. Formula documented in ASSUMPTIONS.md and traceable in covenant meter. |
| Could this work with live data? | Yes — replace JSON files with API calls to each accounting system; same schema and driver model. |
| What if a new project is added? | New project rows flow through the same ingest → forecast pipeline automatically. |
