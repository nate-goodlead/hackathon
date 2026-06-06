-- Single-team deployment: disable RLS so service_role can read/write all tables.
-- Re-enable with policies when Supabase Auth is added.

alter table if exists opcos disable row level security;
alter table if exists gl_mappings disable row level security;
alter table if exists upload_batches disable row level security;
alter table if exists financial_transactions disable row level security;
alter table if exists weather_daily disable row level security;
alter table if exists forecast_runs disable row level security;
alter table if exists forecast_weeks disable row level security;
alter table if exists forecast_trace_lines disable row level security;
