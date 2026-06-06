-- Seed challenge-provider opcos (stable UUIDs for idempotent migrations)
insert into opcos (id, slug, name, city, region, lat, lng, source_system, data_folder, notes)
values
  (
    'a0000001-0001-4000-8000-000000000001',
    'OPCO-HEEZE',
    'Portfolio Company Heeze',
    'Heeze',
    'Noord-Brabant',
    51.382,
    5.571,
    'Exact',
    'portfolio company data',
    'GB 8000/8001/8002 transaction exports — location not in source files, mapped by data owner'
  ),
  (
    'a0000001-0002-4000-8000-000000000002',
    'OPCO-BRUNSSUM',
    'Dakdekkersbedrijf Peter Ummels',
    'Brunssum',
    'Limburg',
    50.946,
    5.97,
    'Yuki',
    'portfolio company 2 data',
    'FinTransactions exports — Brunssum opco per data owner'
  ),
  (
    'a0000001-0003-4000-8000-000000000003',
    'OPCO-ANDIJK',
    'Portfolio Company Andijk',
    'Andijk',
    'Noord-Holland',
    52.745,
    5.22,
    'Gilde',
    'datasets/Altis dataset 1.xlsx',
    'Monthly P&L workbook — Andijk label on 2026YTD sheet'
  ),
  (
    'a0000001-0004-4000-8000-000000000004',
    'OPCO-WINSCHOTEN',
    'Portfolio Company Winschoten',
    'Winschoten',
    'Groningen',
    53.144,
    7.036,
    'Exact',
    'datasets/Altis dataset 2.xlsx',
    'Transaction journal sheets 2023–2026'
  )
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  region = excluded.region,
  lat = excluded.lat,
  lng = excluded.lng,
  source_system = excluded.source_system,
  data_folder = excluded.data_folder,
  notes = excluded.notes,
  updated_at = now();
