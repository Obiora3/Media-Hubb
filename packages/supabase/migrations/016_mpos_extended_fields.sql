-- Migration 016 — Add extended fields to mpos table
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE mpos
  ADD COLUMN IF NOT EXISTS agency           text          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS spots            integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate             numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_discount  numeric(5,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agency_commission numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross            numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net              numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat              numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total            numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate         numeric(5,2)  NOT NULL DEFAULT 7.5;
