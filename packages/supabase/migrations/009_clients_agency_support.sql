-- Migration 009 — Add Agency type + extended fields to clients table
-- Run in Supabase SQL Editor after 001–008.

-- 1. Widen the type check to include Agency
alter table clients drop constraint if exists clients_type_check;
alter table clients add constraint clients_type_check
  check (type in ('Client', 'Vendor', 'Agency'));

-- 2. Widen the status check to include prospect
alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check
  check (status in ('active', 'inactive', 'prospect'));

-- 3. Add Agency-specific columns (safe to run multiple times)
alter table clients
  add column if not exists address        text not null default '',
  add column if not exists reg_number     text not null default '',
  add column if not exists contact_person text not null default '',
  add column if not exists contact_role   text not null default '',
  add column if not exists website        text not null default '',
  add column if not exists brands         jsonb not null default '[]';
