-- Migration 024 - Restore exact full permissions for every admin profile.
-- Admins should always have the full application permission set, regardless of
-- which UI or trigger last touched their profile.

create or replace function public.admin_permissions()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard',
    'mpo',
    'clients',
    'finance',
    'budgets',
    'revenue-target',
    'reports',
    'calendar',
    'analytics',
    'reminders',
    'users',
    'audit',
    'invoice-wf',
    'settings',
    'dataviz',
    'feed',
    'production',
    'portal'
  ]::text[];
$$;

update public.profiles
set permissions = public.admin_permissions()
where role = 'admin';

create or replace function public.enforce_admin_permissions()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'admin' then
    new.permissions := public.admin_permissions();
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_admin_permissions_on_profiles on public.profiles;
create trigger enforce_admin_permissions_on_profiles
  before insert or update of role, permissions on public.profiles
  for each row
  execute function public.enforce_admin_permissions();

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_role         text;
  v_permissions  text[];
  v_name         text;
  v_initials     text;
begin
  v_workspace_id := (new.raw_user_meta_data->>'workspace_id')::uuid;

  if v_workspace_id is null then
    select id into v_workspace_id
    from public.workspaces
    order by created_at
    limit 1;
  end if;

  v_role := coalesce(new.raw_user_meta_data->>'role', 'viewer');

  if v_role not in ('admin', 'manager', 'viewer', 'client') then
    v_role := 'viewer';
  end if;

  v_name     := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '');
  v_initials := upper(left(split_part(trim(v_name), ' ', 1), 1) || left(split_part(trim(v_name), ' ', 2), 1));

  v_permissions := case v_role
    when 'admin' then public.admin_permissions()
    when 'manager' then array[
      'dashboard','mpo','clients','finance','budgets','revenue-target','reports','calendar',
      'analytics','reminders','audit','invoice-wf','feed'
    ]
    when 'viewer' then array[
      'dashboard','mpo','clients','revenue-target','calendar','feed'
    ]
    when 'client' then array[
      'dashboard','revenue-target'
    ]
    else array['dashboard','mpo','clients','revenue-target','calendar','feed']
  end;

  insert into public.profiles (id, workspace_id, name, role, permissions, initials)
  values (new.id, v_workspace_id, v_name, v_role, v_permissions, coalesce(nullif(v_initials, ''), '?'))
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        name         = case when coalesce(public.profiles.name, '') = '' then excluded.name else public.profiles.name end,
        role         = excluded.role,
        permissions  = excluded.permissions,
        initials     = case when coalesce(public.profiles.initials, '') in ('', '?') then excluded.initials else public.profiles.initials end;

  return new;
end;
$$;
