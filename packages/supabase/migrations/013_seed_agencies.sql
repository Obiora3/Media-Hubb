-- Migration 013 — Seed agencies: QVT Media, SHUTTA/MEDIA FUSE, Acuity
-- Run in Supabase Dashboard → SQL Editor

INSERT INTO clients (
  workspace_id, name, type, industry, status,
  contact, email, phone, address, reg_number,
  contact_person, contact_role, website, brands
)
VALUES

-- ── QVT Media ────────────────────────────────────────────────────────────────
(
  (SELECT id FROM workspaces LIMIT 1),
  'QVT Media', 'Agency', 'Media', 'active',
  '', '', '', '', '', '', '', '',
  '[
    {"id":"b-qvt-1",  "name":"SUPRAMULT TGI",   "category":"Health & Wellness (Supplements)"},
    {"id":"b-qvt-2",  "name":"COMAL TGI",        "category":"Health & Wellness"},
    {"id":"b-qvt-3",  "name":"TGI",              "category":"Food & Culinary"},
    {"id":"b-qvt-4",  "name":"MR CHEF",          "category":"Food & Culinary"},
    {"id":"b-qvt-5",  "name":"KNORR",            "category":"Food & Culinary"},
    {"id":"b-qvt-6",  "name":"COCA-COLA",        "category":"Beverages & Confectionery"},
    {"id":"b-qvt-7",  "name":"PEPSODENT",        "category":"Oral Care"},
    {"id":"b-qvt-8",  "name":"SUPREME NOODLES",  "category":"Food & Culinary"},
    {"id":"b-qvt-9",  "name":"NUTRI-CHOCO",      "category":"Beverages & Confectionery"},
    {"id":"b-qvt-10", "name":"MACA",             "category":"Beverages & Confectionery"}
  ]'::jsonb
),

-- ── SHUTTA/MEDIA FUSE ────────────────────────────────────────────────────────
(
  (SELECT id FROM workspaces LIMIT 1),
  'SHUTTA/MEDIA FUSE', 'Agency', 'Media', 'active',
  '', '', '', '', '', '', '', '',
  '[
    {"id":"b-smf-1", "name":"BAMA",                  "category":"Food & Culinary"},
    {"id":"b-smf-2", "name":"GLOVO",                 "category":"Tech / Delivery Services"},
    {"id":"b-smf-3", "name":"AER POCKET",            "category":"Household / Utilities"},
    {"id":"b-smf-4", "name":"MEGAGROWTH",            "category":"Personal Care & Beauty"},
    {"id":"b-smf-5", "name":"DARLING NATURAL TWIST", "category":"Personal Care & Beauty"},
    {"id":"b-smf-6", "name":"NIVEA COCOA",           "category":"Personal Care & Beauty"}
  ]'::jsonb
),

-- ── Acuity ───────────────────────────────────────────────────────────────────
(
  (SELECT id FROM workspaces LIMIT 1),
  'Acuity', 'Agency', 'Media', 'active',
  '', '', '', '', '', '', '', '',
  '[
    {"id":"b-acu-1", "name":"COLGATE", "category":"Oral Care"}
  ]'::jsonb
);
