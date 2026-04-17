-- ═══════════════════════════════════════════════════════════════════
--  MediaHub — Initial Schema
--  Run in: Supabase Dashboard → SQL Editor, or via supabase db push
-- ═══════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Workspaces ───────────────────────────────────────────────────────────────
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  brand_color text not null default '#534AB7',
  plan        text not null default 'free'
                check (plan in ('free', 'pro', 'enterprise')),
  created_at  timestamptz not null default now()
);

-- ── Profiles (extends auth.users) ────────────────────────────────────────────
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  workspace_id uuid references workspaces on delete set null,
  name         text not null default '',
  role         text not null default 'viewer'
                 check (role in ('admin', 'manager', 'viewer', 'client')),
  permissions  text[] not null default '{}',
  color        text not null default '#534AB7',
  initials     text not null default '',
  created_at   timestamptz not null default now()
);

-- Auto-create a bare profile row when a new auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Clients & Vendors ────────────────────────────────────────────────────────
create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  type         text not null default 'Client'
                 check (type in ('Client', 'Vendor')),
  industry     text not null default '',
  contact      text not null default '',
  email        text not null default '',
  phone        text not null default '',
  spend        numeric(15,2) not null default 0,
  status       text not null default 'active'
                 check (status in ('active', 'inactive')),
  created_at   timestamptz not null default now()
);

-- ── Media Purchase Orders ─────────────────────────────────────────────────────
create table if not exists mpos (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  -- Denormalised for simplicity; replace with client_id/vendor_id FKs if preferred
  client       text not null default '',
  vendor       text not null default '',
  campaign     text not null default '',
  channel      text not null default 'TV'
                 check (channel in ('TV', 'Print', 'Radio', 'Digital', 'OOH', 'Online')),
  amount       numeric(15,2) not null default 0,
  currency     text not null default 'NGN'
                 check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES')),
  status       text not null default 'draft'
                 check (status in ('draft', 'pending', 'active', 'completed', 'cancelled')),
  exec_status  text not null default 'pending'
                 check (exec_status in ('pending', 'on-track', 'delayed', 'completed')),
  start_date   date not null,
  end_date     date not null,
  docs         jsonb not null default '[]',
  created_by   uuid references profiles on delete set null,
  created_at   timestamptz not null default now()
);

-- ── Invoices / Receivables ────────────────────────────────────────────────────
create table if not exists invoices (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  client       text not null default '',
  mpo_ref      text not null default '',   -- denormalised MPO id string
  amount       numeric(15,2) not null default 0,
  paid         numeric(15,2) not null default 0,
  due_date     date not null,
  wf_status    text not null default 'draft'
                 check (wf_status in ('draft', 'review', 'approved', 'sent')),
  currency     text not null default 'NGN'
                 check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES')),
  docs         jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

-- Derived status view (avoids storing computed field)
create or replace view invoices_with_status as
  select *,
    case
      when paid >= amount then 'paid'
      when paid  > 0      then 'partial'
      when due_date < current_date then 'overdue'
      else 'pending'
    end as status
  from invoices;

-- ── Payables ──────────────────────────────────────────────────────────────────
create table if not exists payables (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  vendor       text not null default '',
  mpo_ref      text not null default '',
  amount       numeric(15,2) not null default 0,
  paid         numeric(15,2) not null default 0,
  due_date     date not null,
  description  text not null default '',
  currency     text not null default 'NGN'
                 check (currency in ('NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES')),
  created_at   timestamptz not null default now()
);

create or replace view payables_with_status as
  select *,
    case
      when paid >= amount then 'paid'
      when paid  > 0      then 'partial'
      when due_date < current_date then 'overdue'
      else 'pending'
    end as status
  from payables;

-- ── Budgets ───────────────────────────────────────────────────────────────────
create table if not exists budgets (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces on delete cascade,
  mpo_id         text not null default '',   -- denormalised MPO id
  budget_amount  numeric(15,2) not null default 0,
  spent_amount   numeric(15,2) not null default 0,
  alert_pct      int  not null default 80
                   check (alert_pct between 1 and 100),
  period         text not null default '',
  created_at     timestamptz not null default now()
);

-- ── Comments ──────────────────────────────────────────────────────────────────
create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  entity_id    text not null,
  user_id      uuid references profiles on delete set null,
  user_name    text not null default '',
  user_color   text not null default '',
  user_initials text not null default '',
  text         text not null,
  created_at   timestamptz not null default now()
);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id      uuid references profiles on delete set null,
  user_name    text not null default '',
  user_color   text not null default '',
  initials     text not null default '',
  action       text not null default '',
  entity       text not null default '',
  entity_id    text not null default '',
  detail       text not null default '',
  tag          text not null default 'update'
                 check (tag in ('create', 'workflow', 'payment', 'reminder', 'delete', 'update')),
  ts           text not null default '',
  created_at   timestamptz not null default now()
);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  user_id      uuid references profiles on delete cascade,
  type         text not null default 'system'
                 check (type in ('payment', 'overdue', 'workflow', 'reminder', 'create', 'system')),
  title        text not null default '',
  body         text not null default '',
  read         boolean not null default false,
  ts           text not null default '',
  created_at   timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists idx_mpos_workspace        on mpos(workspace_id);
create index if not exists idx_clients_workspace     on clients(workspace_id);
create index if not exists idx_invoices_workspace    on invoices(workspace_id);
create index if not exists idx_payables_workspace    on payables(workspace_id);
create index if not exists idx_budgets_workspace     on budgets(workspace_id);
create index if not exists idx_comments_entity       on comments(entity_id);
create index if not exists idx_audit_workspace       on audit_log(workspace_id);
create index if not exists idx_notif_user            on notifications(user_id);
