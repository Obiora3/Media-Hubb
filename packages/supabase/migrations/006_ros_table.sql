-- ═══════════════════════════════════════════════════════════════════
--  Migration 006 — Release Orders (ROs)
--  Run in Supabase SQL Editor after 001–005.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists ros (
  id           text        primary key,
  workspace_id uuid        not null references workspaces(id) on delete cascade,
  mpo_id       text,
  client       text        not null,
  vendor       text        not null,
  campaign     text        not null,
  channel      text        not null default 'TV',
  start_date   date        not null,
  end_date     date        not null,
  status       text        not null default 'draft',
  currency     text        not null default 'NGN',
  schedule     jsonb       not null default '[]',
  docs         jsonb       not null default '[]',
  created_at   timestamptz not null default now()
);

alter table ros enable row level security;

-- Workspace members can read ROs in their workspace
create policy "workspace members can read ros"
  on ros for select
  using (workspace_id = my_workspace_id());

-- Workspace members can create ROs
create policy "workspace members can insert ros"
  on ros for insert
  with check (workspace_id = my_workspace_id());

-- Workspace members can update ROs in their workspace
create policy "workspace members can update ros"
  on ros for update
  using (workspace_id = my_workspace_id());

-- Workspace members can delete ROs in their workspace
create policy "workspace members can delete ros"
  on ros for delete
  using (workspace_id = my_workspace_id());
