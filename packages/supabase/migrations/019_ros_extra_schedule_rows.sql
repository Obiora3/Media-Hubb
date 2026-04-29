-- Migration 019 — Add extra_schedule_rows column to ros table
-- This stores additional schedule rows (time slots) beyond the primary one.
-- Run this in Supabase Dashboard → SQL Editor

alter table ros
  add column if not exists extra_schedule_rows jsonb not null default '[]'::jsonb;
