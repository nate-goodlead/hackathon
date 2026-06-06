# Altis Groep — Assumptions Log

| Assumption | Value / Rule | Source |
|------------|--------------|--------|
| Payment lag — large customers | 45 days | Covenant doc / estimate |
| Payment lag — small customers | 30 days | Team estimate |
| Rain delay threshold | >5 mm/day = 1 delay day | Weather CSV + judgment |
| Frost delay threshold | <0°C min temp = 1 delay day | Business context doc |
| Wet quarter definition | 2× average weekly rainfall delay days | Team decision — documented |
| Dry quarter definition | 0.5× average weekly rainfall delay days | Team decision — documented |
| Covenant — headroom threshold | €500,000 | covenant_terms.json (synthetic) |
| Interest Coverage Ratio minimum | 2.0× | covenant_terms.json |
| Current Interest Coverage Ratio | 2.4× | covenant_terms.json |
| WIP recognition method | Dutch GAAP — percentage of completion | Business context doc |
| Materials payment terms | Net-30 from order date | Business context doc |
| Subcontractor payment trigger | Milestone sign-off (% complete threshold) | Business context doc |
| Sign convention | Outflows negative, inflows positive (EUR) | Team standard |
| Forecast horizon | 13-week rolling | Hackathon brief |
| Weather impact mechanism | Schedule delay pushes milestone billing; materials stay in original week | Hackathon brief |
| Unmapped GL accounts | Tagged `unmapped`, never silently dropped | Person 1 rule |
| Duplicate transactions | Removed via hash key across systems | Person 1 ingest |

## Scenario Definitions

- **Base:** Actual weather delay days from weather.csv
- **Wet Quarter:** Delay days multiplied by 2.0 — more milestones shift right, early weeks worse
- **Dry Quarter:** Delay days multiplied by 0.5 — milestones pulled forward, early weeks better

## Covenant Headroom Formula

```
headroom = headroom_threshold_eur - projected_net_debt_increase
projected_net_debt_increase = max(0, -cumulative_13wk_net × 0.08)
```

Warning banner triggers when scenario = Wet Quarter AND headroom < 20% of threshold.

## Data Sources

| System | Source folder / file | Location (mapped) | Notes |
|--------|---------------------|-------------------|-------|
| Exact | `portfolio company data/` | **Heeze** | GB 8000/8001/8002 — location not in file |
| Yuki | `portfolio company 2 data/` | **Brunssum** | Peter Ummels FinTransactions |
| Gilde | `Altis dataset 1.xlsx` | **Andijk** | Monthly P&L; "Andijk" label on 2026YTD sheet |
| Exact | `Altis dataset 2.xlsx` | **Winschoten** | Journal sheets 2024–2026 |

Location mapping is required because source exports do not include company city. Weather impact is modelled **per city** using `data/raw/weather.csv`.

*Drop zip files in `data/incoming/` and run `npm run data:pipeline`.*
