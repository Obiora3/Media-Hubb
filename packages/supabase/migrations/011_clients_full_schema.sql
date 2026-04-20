-- Migration 011 — Full clients table fix (idempotent — safe to run even if 009 was already run)
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Drop old type constraint and add all three types
alter table clients drop constraint if exists clients_type_check;
alter table clients add constraint clients_type_check
  check (type in ('Client', 'Vendor', 'Agency'));

-- 2. Drop old status constraint and add 'prospect'
alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check
  check (status in ('active', 'inactive', 'prospect'));

-- 3. Add all agency / extended columns (safe to run multiple times)
alter table clients
  add column if not exists phone          text not null default '',
  add column if not exists address        text not null default '',
  add column if not exists reg_number     text not null default '',
  add column if not exists contact_person text not null default '',
  add column if not exists contact_role   text not null default '',
  add column if not exists website        text not null default '',
  add column if not exists brands         jsonb not null default '[]';
