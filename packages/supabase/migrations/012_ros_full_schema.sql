-- Migration 012 — Full ros table schema (idempotent — safe to run even if 007/008/010 were already run)
-- Run this in Supabase Dashboard → SQL Editor

-- Add all columns that fromRo mapper sends (safe to run multiple times)
alter table ros
  add column if not exists rate               numeric(15,2) not null default 0,
  add column if not exists time_slot          text not null default '',
  add column if not exists volume_discount    numeric(5,2)  not null default 0,
  add column if not exists agency_commission  numeric(5,2)  not null default 0,
  add column if not exists programme          text not null default '',
  add column if not exists material_title     text not null default '',
  add column if not exists material_duration  text not null default '',
  add column if not exists campaign_month     text not null default '';

-- Make start_date and end_date nullable (ROs created before dates are filled in will fail otherwise)
alter table ros alter column start_date drop not null;
alter table ros alter column end_date   drop not null;
