-- ═══════════════════════════════════════════════════════════════════
--  MediaHub — Seed Data
--  Run AFTER migrations 001 + 002 in Supabase SQL Editor.
--
--  UUID rules: only hex digits 0-9 and a-f are valid.
--  ID ranges used:
--    workspaces : 0000...0001-0003
--    clients    : 0000...0011-0016  (0011-0013 = clients, 0014-0016 = vendors)
--    mpos       : 0000...0021-0026
--    invoices   : 0000...0031-0036
--    payables   : 0000...0041-0045
--    budgets    : 0000...0051-0053
--    audit_log  : 0000...0061-0063
-- ═══════════════════════════════════════════════════════════════════

-- ── Workspaces ────────────────────────────────────────────────────────────────
insert into workspaces (id, name, brand_color, plan)
values
  ('00000000-0000-0000-0000-000000000001', 'MediaHub Nigeria',   '#534AB7', 'pro'),
  ('00000000-0000-0000-0000-000000000002', 'PanAfrica Media',    '#185FA5', 'free'),
  ('00000000-0000-0000-0000-000000000003', 'East Africa Bureau', '#3B6D11', 'free')
on conflict (id) do nothing;

-- ── Clients ───────────────────────────────────────────────────────────────────
insert into clients (id, workspace_id, name, type, industry, contact, email, spend, status)
values
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   'Zenith Bank', 'Client', 'Banking', 'Adaeze Obi', 'adaeze@zenithbank.com', 4200000, 'active'),

  ('00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000001',
   'MTN Nigeria', 'Client', 'Telecom', 'Emeka Eze', 'emeka@mtn.ng', 7800000, 'active'),

  ('00000000-0000-0000-0000-000000000013',
   '00000000-0000-0000-0000-000000000001',
   'Dangote Group', 'Client', 'FMCG', 'Fatima Dangote', 'fatima@dangote.com', 2900000, 'active'),

  -- Vendors
  ('00000000-0000-0000-0000-000000000014',
   '00000000-0000-0000-0000-000000000001',
   'Channels TV', 'Vendor', 'TV', 'Yemi Adedeji', 'yemi@channelstv.com', 0, 'active'),

  ('00000000-0000-0000-0000-000000000015',
   '00000000-0000-0000-0000-000000000001',
   'Vanguard Media', 'Vendor', 'Print', 'Kelechi Nwosu', 'k.nwosu@vanguard.com', 0, 'active'),

  ('00000000-0000-0000-0000-000000000016',
   '00000000-0000-0000-0000-000000000001',
   'TVC News', 'Vendor', 'TV', 'Bola Adeyemi', 'bola@tvcnews.com', 0, 'active')
on conflict (id) do nothing;

-- ── Media Purchase Orders ─────────────────────────────────────────────────────
insert into mpos (id, workspace_id, client, vendor, campaign, amount, status, start_date, end_date, exec_status, channel, currency, docs)
values
  ('00000000-0000-0000-0000-000000000021',
   '00000000-0000-0000-0000-000000000001',
   'Zenith Bank', 'Channels TV', 'Q1 Brand Push',
   4200000, 'active', '2025-04-01', '2025-06-30', 'on-track', 'TV', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000022',
   '00000000-0000-0000-0000-000000000001',
   'MTN Nigeria', 'Vanguard Media', '5G Launch',
   7800000, 'pending', '2025-05-01', '2025-07-31', 'pending', 'Print', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000023',
   '00000000-0000-0000-0000-000000000001',
   'Dangote Group', 'TVC News', 'Heritage Series',
   2900000, 'active', '2025-03-15', '2025-05-15', 'delayed', 'TV', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000024',
   '00000000-0000-0000-0000-000000000001',
   'GTBank', 'Guardian Newspapers', 'Corporate Rebranding',
   1500000, 'completed', '2025-01-01', '2025-03-31', 'on-track', 'Print', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000025',
   '00000000-0000-0000-0000-000000000001',
   'Airtel Nigeria', 'Arise TV', 'Data4Good',
   5600000, 'active', '2025-04-15', '2025-08-31', 'on-track', 'TV', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000026',
   '00000000-0000-0000-0000-000000000001',
   'Shell Nigeria', 'BBC Africa', 'Pan-Africa Reach',
   890000, 'active', '2025-03-01', '2025-06-30', 'on-track', 'TV', 'USD', '[]')
on conflict (id) do nothing;

-- ── Invoices ──────────────────────────────────────────────────────────────────
insert into invoices (id, workspace_id, client, mpo_ref, amount, paid, due_date, wf_status, currency, docs)
values
  ('00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000001',
   'Zenith Bank', 'MPO-001', 2100000, 2100000, '2025-04-30', 'sent', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000032',
   '00000000-0000-0000-0000-000000000001',
   'MTN Nigeria', 'MPO-002', 3900000, 0, '2025-04-10', 'approved', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000033',
   '00000000-0000-0000-0000-000000000001',
   'Dangote Group', 'MPO-003', 2900000, 1000000, '2025-05-01', 'sent', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000034',
   '00000000-0000-0000-0000-000000000001',
   'GTBank', 'MPO-004', 1500000, 1500000, '2025-03-31', 'sent', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000035',
   '00000000-0000-0000-0000-000000000001',
   'Airtel Nigeria', 'MPO-005', 2800000, 0, '2026-06-15', 'draft', 'NGN', '[]'),

  ('00000000-0000-0000-0000-000000000036',
   '00000000-0000-0000-0000-000000000001',
   'Shell Nigeria', 'MPO-006', 6200, 0, '2026-05-01', 'review', 'USD', '[]')
on conflict (id) do nothing;

-- ── Payables ──────────────────────────────────────────────────────────────────
insert into payables (id, workspace_id, vendor, mpo_ref, amount, paid, due_date, description, currency)
values
  ('00000000-0000-0000-0000-000000000041',
   '00000000-0000-0000-0000-000000000001',
   'Channels TV', 'MPO-001', 1890000, 1890000, '2025-05-15', 'Airtime Q1', 'NGN'),

  ('00000000-0000-0000-0000-000000000042',
   '00000000-0000-0000-0000-000000000001',
   'Vanguard Media', 'MPO-002', 3510000, 0, '2025-05-30', 'Print ads', 'NGN'),

  ('00000000-0000-0000-0000-000000000043',
   '00000000-0000-0000-0000-000000000001',
   'TVC News', 'MPO-003', 1305000, 700000, '2025-04-20', 'Sponsorship', 'NGN'),

  ('00000000-0000-0000-0000-000000000044',
   '00000000-0000-0000-0000-000000000001',
   'Guardian Newspapers', 'MPO-004', 675000, 675000, '2025-03-15', 'Display ads', 'NGN'),

  ('00000000-0000-0000-0000-000000000045',
   '00000000-0000-0000-0000-000000000001',
   'Arise TV', 'MPO-005', 2520000, 0, '2026-07-01', 'Evening show', 'NGN')
on conflict (id) do nothing;

-- ── Budgets ───────────────────────────────────────────────────────────────────
insert into budgets (id, workspace_id, mpo_id, budget_amount, spent_amount, alert_pct, period)
values
  ('00000000-0000-0000-0000-000000000051',
   '00000000-0000-0000-0000-000000000001',
   'MPO-001', 4200000, 1890000, 80, 'Q1 2025'),

  ('00000000-0000-0000-0000-000000000052',
   '00000000-0000-0000-0000-000000000001',
   'MPO-002', 7800000, 0, 80, 'Q2 2025'),

  ('00000000-0000-0000-0000-000000000053',
   '00000000-0000-0000-0000-000000000001',
   'MPO-005', 5600000, 2520000, 75, 'Q2-Q3 2025')
on conflict (id) do nothing;

-- ── Audit log ────────────────────────────────────────────────────────────────
-- user_id is NULL — no real auth users exist yet.
-- Real entries will be written by the app once users sign in.
insert into audit_log (id, workspace_id, user_id, user_name, user_color, initials, action, entity, entity_id, detail, tag, ts)
values
  ('00000000-0000-0000-0000-000000000061',
   '00000000-0000-0000-0000-000000000001',
   null, 'Amaka Okonkwo', '#534AB7', 'AO',
   'created', 'MPO', 'MPO-005',
   'Created MPO-005 for Airtel Nigeria · ₦5.6M', 'create', '15 Apr, 09:14'),

  ('00000000-0000-0000-0000-000000000062',
   '00000000-0000-0000-0000-000000000001',
   null, 'Bolu Adeyemi', '#185FA5', 'BA',
   'updated', 'Invoice', 'INV-002',
   'Advanced INV-002: Draft → Review', 'workflow', '15 Apr, 10:32'),

  ('00000000-0000-0000-0000-000000000063',
   '00000000-0000-0000-0000-000000000001',
   null, 'Amaka Okonkwo', '#534AB7', 'AO',
   'logged payment', 'Invoice', 'INV-003',
   'Logged ₦1,000,000 on INV-003', 'payment', '14 Apr, 16:45')
on conflict (id) do nothing;


-- ═══════════════════════════════════════════════════════════════════
--  POST-SIGNUP — run this block AFTER creating your account in the app.
--
--  1. Sign up at http://localhost:5173
--  2. Go to Supabase Dashboard → Authentication → Users
--  3. Copy your UUID from the "UID" column
--  4. Paste it below replacing YOUR-UUID-HERE, then run this query
-- ═══════════════════════════════════════════════════════════════════

/*
update profiles
set
  workspace_id = '00000000-0000-0000-0000-000000000001',
  name         = 'Your Name',
  role         = 'admin',
  initials     = 'YN',
  color        = '#534AB7',
  permissions  = ARRAY[
    'dashboard','mpo','clients','finance','budgets','reports',
    'calendar','analytics','reminders','users','audit',
    'invoice-wf','settings','dataviz','feed','production'
  ]
where id = 'YOUR-UUID-HERE';
*/
