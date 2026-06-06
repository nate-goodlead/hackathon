# RoofFlow Radar (original teammate repo)

Preserved from [Hackathon2026](https://github.com/Kenneth-van-der-Maazen/Hackathon2026) commit `e4a9d38`.

Contains the in-browser forecast engine, Claude agent panel, and seed data from the original SPA. The main app now uses the Python pipeline + shadcn UI in `src/`.

To reference or port features:
- `agent/` — Claude agent with tool calling
- `lib/forecast.ts` — client-side 13-week forecast
- `lib/accounting.ts` — Exact CSV → cash events
- `data/seedData.ts` — synthetic demo portfolio (not used in production path)
