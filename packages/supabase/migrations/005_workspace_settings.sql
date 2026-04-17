-- ═══════════════════════════════════════════════════════════════════
--  Migration 005 — Workspace Settings
--  Run in Supabase SQL Editor after 001–004.
-- ═══════════════════════════════════════════════════════════════════

-- Add settings JSONB column to workspaces
alter table workspaces
  add column if not exists settings jsonb not null default '{}';

-- Allow workspace members to read their workspace
drop policy if exists "members can read own workspace" on workspaces;
create policy "members can read own workspace"
  on workspaces for select
  using (id = my_workspace_id());

-- Allow admins to update their workspace (name, brand_color, settings)
drop policy if exists "admins can update workspace" on workspaces;
create policy "admins can update workspace"
  on workspaces for update
  using (
    id = my_workspace_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Allow admins to create new workspaces
drop policy if exists "admins can create workspaces" on workspaces;
create policy "admins can create workspaces"
  on workspaces for insert
  with check (auth.role() = 'authenticated');
