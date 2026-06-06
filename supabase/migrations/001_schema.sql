-- Altis cashflow consolidated schema

create extension if not exists "pgcrypto";

-- Opco registry (user-managed)
create table if not exists opcos (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  city          text not null,
  region        text,
  lat           double precision not null,
  lng           double precision not null,
  source_system text,
  data_folder   text,
  notes         text,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_opcos_active on opcos (is_active);
create index if not exists idx_opcos_data_folder on opcos (data_folder) where data_folder is not null;

-- GL mapping (replaces gl_mapping.csv)
create table if not exists gl_mappings (
  id          uuid primary key default gen_random_uuid(),
  opco_id     uuid references opcos(id) on delete cascade,
  gl_account  text not null,
  category    text not null,
  status      text default 'approved',
  description text,
  unique (opco_id, gl_account)
);

create index if not exists idx_gl_mappings_account on gl_mappings (gl_account);

-- Upload batches
create table if not exists upload_batches (
  id              uuid primary key default gen_random_uuid(),
  opco_id         uuid references opcos(id),
  filename        text not null,
  storage_path    text,
  source_system   text,
  detected_system text,
  store_type      text,
  status          text default 'analyzed',
  ai_analysis     jsonb,
  column_mapping  jsonb,
  row_count       int,
  rows_added      int,
  warnings        jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_upload_batches_opco on upload_batches (opco_id);

-- Enums for transactions
do $$ begin
  create type store_type as enum ('revenue', 'costs', 'overhead', 'ledger');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type gl_category as enum (
    'materials', 'subcontractors', 'billing', 'payment_lag', 'overhead', 'unmapped'
  );
exception when duplicate_object then null;
end $$;

-- Financial transactions (master fact table)
create table if not exists financial_transactions (
  id              uuid primary key default gen_random_uuid(),
  opco_id         uuid not null references opcos(id),
  upload_batch_id uuid references upload_batches(id),
  txn_date        date not null,
  gl_account      text not null,
  amount          numeric(14, 2) not null,
  description     text,
  project_id      text,
  source_system   text not null,
  gl_category     text not null,
  store_type      text not null,
  city            text,
  dedup_hash      text not null,
  created_at      timestamptz default now(),
  unique (dedup_hash)
);

create index if not exists idx_fin_txn_opco_date on financial_transactions (opco_id, txn_date);
create index if not exists idx_fin_txn_store on financial_transactions (store_type, gl_category);
create index if not exists idx_fin_txn_batch on financial_transactions (upload_batch_id);

-- Weather cache
create table if not exists weather_daily (
  id               uuid primary key default gen_random_uuid(),
  opco_id          uuid not null references opcos(id) on delete cascade,
  weather_date     date not null,
  rainfall_mm      numeric(6, 1),
  temp_min_c       numeric(5, 1),
  temp_max_c       numeric(5, 1),
  precip_hours     numeric(5, 1),
  is_stoppage      boolean default false,
  stoppage_reasons text[],
  source           text not null,
  fetched_at       timestamptz default now(),
  unique (opco_id, weather_date, source)
);

create index if not exists idx_weather_opco_date on weather_daily (opco_id, weather_date);

-- Forecast outputs
create table if not exists forecast_runs (
  id              uuid primary key default gen_random_uuid(),
  anchor_date     date not null,
  created_at      timestamptz default now(),
  is_current      boolean default true,
  wip_snapshot    jsonb,
  covenant_snapshot jsonb,
  portfolio_snapshot jsonb
);

create index if not exists idx_forecast_runs_current on forecast_runs (is_current) where is_current;

create table if not exists forecast_weeks (
  run_id            uuid not null references forecast_runs(id) on delete cascade,
  scenario          text not null,
  week_num          int not null,
  label             text,
  materials         numeric(14, 2),
  subcontractors    numeric(14, 2),
  milestone_billing numeric(14, 2),
  payment_lag       numeric(14, 2),
  weather_impact    numeric(14, 2),
  net               numeric(14, 2),
  primary key (run_id, scenario, week_num)
);

create table if not exists forecast_trace_lines (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references forecast_runs(id) on delete cascade,
  week_num           int not null,
  scenario           text not null,
  driver             text not null,
  amount             numeric(14, 2),
  opco_id            uuid references opcos(id),
  source_system      text,
  gl_account         text,
  project_id         text,
  project_name       text,
  assumption         text,
  source_date        date,
  source_description text
);

create index if not exists idx_trace_run_scenario on forecast_trace_lines (run_id, scenario, week_num);
