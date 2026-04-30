-- ═══════════════════════════════════════════════════════════════════
--  Migration 021 — Revenue Targets as a proper table
--  Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists revenue_targets (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  advertiser   text not null,
  target       numeric not null default 0,
  rev_year     integer not null,
  created_at   timestamptz default now(),
  unique (workspace_id, advertiser, rev_year)
);

alter table revenue_targets enable row level security;

create policy "revenue_targets: read own workspace"
  on revenue_targets for select
  using (workspace_id = my_workspace_id());

create policy "revenue_targets: insert admin or manager"
  on revenue_targets for insert
  with check (
    workspace_id = my_workspace_id()
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
  );

create policy "revenue_targets: update admin or manager"
  on revenue_targets for update
  using (
    workspace_id = my_workspace_id()
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
  );

create policy "revenue_targets: delete admin or manager"
  on revenue_targets for delete
  using (
    workspace_id = my_workspace_id()
    and exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
  );
