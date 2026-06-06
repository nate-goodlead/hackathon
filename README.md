# Altis Groep — Weather-Aware Cash Flow Forecasting

Hackathon 2026 dashboard for Altis Groep: multi-role CFO / Opco MD views, AI-powered data ingestion, and a Python forecast pipeline.

## Quick start

```bash
# 1. Install frontend deps
npm install

# 2. Python backend (upload API + forecast)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Environment — copy and add your Anthropic key (server-side only)
cp .env.example .env

# 4. Run both servers
npm run dev:api   # FastAPI on :8000
npm run dev       # Vite on :5173
```

Open **http://localhost:5173** — the **Data Upload** page is the default landing view.

## Data flow

1. **Upload** — Drop Excel/CSV from Gilde, Yuki, Exact, or Snelstart
2. **AI briefing** — Claude analyses columns, GL accounts, and opco/city
3. **Review** — Confirm column + GL mappings
4. **Push** — Merges into `data/output/unified_data.csv` and refreshes forecast JSON

## Reset to empty (fresh test)

```bash
.venv/bin/python scripts/reset_data.py
```

Clears unified data, upload staging, and regenerates empty forecast outputs.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:full` | API + Vite together |
| `npm run data:pipeline` | Bulk parse zips in `data/incoming/` |
| `npm run data:weather` | Fetch Open-Meteo weather |
| `npm run data:forecast` | Rebuild forecast JSON from unified CSV |

## Project structure

```
src/                  React UI (shadcn + Tailwind v4)
scripts/              Python ingest, forecast, upload API
data/output/          Central database (unified_data.csv)
public/data/          JSON served to dashboards
legacy/roofflow/      Original teammate SPA (agent + in-browser forecast)
```

## Roles

- **Data Upload** — Ingest accounting exports with AI review
- **CFO** — 13-week forecast, covenant, 5-driver chart, traceability
- **Opco MD** — WIP table, at-risk projects, weather panel

## API

- `GET /api/health` — AI availability
- `POST /api/upload/analyze` — Upload + analyse file
- `POST /api/upload/{id}/confirm` — Merge into central database
- `GET /api/unified/stats` — Row counts
