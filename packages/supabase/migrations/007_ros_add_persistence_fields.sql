-- Add persisted RO fields introduced in the app after the initial ros table.
-- Safe to run multiple times.

alter table if exists ros
  add column if not exists campaign_month text,
  add column if not exists rate numeric not null default 0,
  add column if not exists time_slot text not null default '',
  add column if not exists volume_discount numeric not null default 0,
  add column if not exists agency_commission numeric not null default 0;

-- Backfill campaign_month for existing rows from start_date where possible.
update ros
set campaign_month = to_char(start_date, 'YYYY-MM')
where campaign_month is null
  and start_date is not null;
