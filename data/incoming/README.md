# Drop your hackathon data here

You dropped **3 zip files** — that's fine. The parser extracts them automatically.

## Your data → company locations

The source files don't include location. Use this mapping (from the data owner):

| Zip / folder | Company location | Accounting system |
|--------------|------------------|-------------------|
| `portfolio company data` | **Heeze** | Exact (GB 8000/8001/8002) |
| `portfolio company 2 data` | **Brunssum** (Peter Ummels) | Yuki |
| `Altis dataset 1.xlsx` | **Andijk** | Gilde (monthly P&L) |
| `Altis dataset 2.xlsx` | **Winschoten** | Exact (journal) |

Location mapping is stored in [`opco_locations.json`](opco_locations.json).

## After dropping zip files

```bash
cd /Users/milton/Hackathon/altis-cashflow
npm run data:pipeline
npm run dev
```

This will:
1. Extract zips from this folder
2. Parse all xlsx files with location tags
3. Build weather.csv **per city** (Heeze, Brunssum, Andijk, Winschoten)
4. Run forecast + update dashboards

## Files accepted

- `*.zip` — auto-extracted to `extracted/`
- Pre-extracted xlsx in `extracted/` also works

You do **not** need to rename files to `gilde_export.csv` etc.
