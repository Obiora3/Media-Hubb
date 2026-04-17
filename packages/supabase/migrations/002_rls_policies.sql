-- ═══════════════════════════════════════════════════════════════════
--  MediaHub — Row Level Security Policies
--  Run AFTER 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── Helper function ───────────────────────────────────────────────────────────
-- Returns the workspace_id of the currently authenticated user.
create or replace function my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from profiles where id = auth.uid()
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- Users can read their own profile
create policy "profiles: read own"
  on profiles for select
  using (id = auth.uid());

-- Users can read profiles in the same workspace (for @mention, user lists)
create policy "profiles: read same workspace"
  on profiles for select
  using (workspace_id = my_workspace_id());

-- Users can update only their own profile
create policy "profiles: update own"
  on profiles for update
  using (id = auth.uid());

-- ── workspaces ────────────────────────────────────────────────────────────────
alter table workspaces enable row level security;

create policy "workspaces: read own"
  on workspaces for select
  using (id = my_workspace_id());

-- Only admins can update workspace settings
create policy "workspaces: update admin only"
  on workspaces for update
  using (
    id = my_workspace_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ── clients ───────────────────────────────────────────────────────────────────
alter table clients enable row level security;

create policy "clients: workspace isolation"
  on clients for select
  using (workspace_id = my_workspace_id());

create policy "clients: insert own workspace"
  on clients for insert
  with check (workspace_id = my_workspace_id());

create policy "clients: update own workspace"
  on clients for update
  using (workspace_id = my_workspace_id());

create policy "clients: delete admin/manager"
  on clients for delete
  using (
    workspace_id = my_workspace_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- ── mpos ──────────────────────────────────────────────────────────────────────
alter table mpos enable row level security;

create policy "mpos: workspace isolation"
  on mpos for select
  using (workspace_id = my_workspace_id());

create policy "mpos: insert own workspace"
  on mpos for insert
  with check (workspace_id = my_workspace_id());

create policy "mpos: update own workspace"
  on mpos for update
  using (workspace_id = my_workspace_id());

create policy "mpos: delete admin only"
  on mpos for delete
  using (
    workspace_id = my_workspace_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ── invoices ──────────────────────────────────────────────────────────────────
alter table invoices enable row level security;

create policy "invoices: workspace isolation"    on invoices for select using (workspace_id = my_workspace_id());
create policy "invoices: insert own workspace"   on invoices for insert with check (workspace_id = my_workspace_id());
create policy "invoices: update own workspace"   on invoices for update using (workspace_id = my_workspace_id());
create policy "invoices: delete admin/manager"   on invoices for delete using (
  workspace_id = my_workspace_id()
  and exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
);

-- ── payables ──────────────────────────────────────────────────────────────────
alter table payables enable row level security;

create policy "payables: workspace isolation"    on payables for select using (workspace_id = my_workspace_id());
create policy "payables: insert own workspace"   on payables for insert with check (workspace_id = my_workspace_id());
create policy "payables: update own workspace"   on payables for update using (workspace_id = my_workspace_id());
create policy "payables: delete admin/manager"   on payables for delete using (
  workspace_id = my_workspace_id()
  and exists (select 1 from profiles where id = auth.uid() and role in ('admin','manager'))
);

-- ── budgets ───────────────────────────────────────────────────────────────────
alter table budgets enable row level security;

create policy "budgets: workspace isolation"     on budgets for select using (workspace_id = my_workspace_id());
create policy "budgets: insert own workspace"    on budgets for insert with check (workspace_id = my_workspace_id());
create policy "budgets: update own workspace"    on budgets for update using (workspace_id = my_workspace_id());
create policy "budgets: delete admin only"       on budgets for delete using (
  workspace_id = my_workspace_id()
  and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- ── comments ──────────────────────────────────────────────────────────────────
alter table comments enable row level security;

create policy "comments: workspace isolation"    on comments for select using (workspace_id = my_workspace_id());
create policy "comments: insert own workspace"   on comments for insert with check (workspace_id = my_workspace_id());
-- Users can delete only their own comments; admins can delete any
create policy "comments: delete own or admin"    on comments for delete using (
  workspace_id = my_workspace_id()
  and (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
);

-- ── audit_log ─────────────────────────────────────────────────────────────────
alter table audit_log enable row level security;

-- Everyone in the workspace can read the audit log
create policy "audit_log: workspace read"        on audit_log for select using (workspace_id = my_workspace_id());
-- Only the app (service role) inserts audit entries; anon insert policy for app inserts:
create policy "audit_log: insert own workspace"  on audit_log for insert with check (workspace_id = my_workspace_id());
-- Audit entries are immutable — no update/delete policies

-- ── notifications ─────────────────────────────────────────────────────────────
alter table notifications enable row level security;

-- Users see only their own notifications
create policy "notifications: read own"          on notifications for select using (user_id = auth.uid());
create policy "notifications: update own"        on notifications for update using (user_id = auth.uid());
create policy "notifications: insert workspace"  on notifications for insert with check (workspace_id = my_workspace_id());
