-- Migration 008 — Add programme and material_title to ros table
-- Run in Supabase SQL Editor after 001–007.

alter table if exists ros
  add column if not exists programme     text not null default '',
  add column if not exists material_title text not null default '';
