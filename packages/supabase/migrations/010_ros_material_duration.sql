-- Migration 010 — Add material_duration to ros table
-- Run in Supabase SQL Editor after 001–009.

alter table if exists ros
  add column if not exists material_duration text not null default '';
