-- Migration 017 — Add material_duration to mpos table
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE mpos
  ADD COLUMN IF NOT EXISTS material_duration integer NOT NULL DEFAULT 30;
