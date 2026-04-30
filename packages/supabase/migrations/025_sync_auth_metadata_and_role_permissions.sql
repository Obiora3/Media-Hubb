-- Migration 025 - Keep role permissions and Auth metadata in sync.
-- If PostREST is slow during page refresh, the app may temporarily fall back to
-- Supabase Auth metadata. Keep that metadata aligned with public.profiles so a
-- stale invite/default role cannot make permissions appear to reset.

create or replace function public.role_permissions(v_role text)
returns text[]
language sql
immutable
as $$
  select case v_role
    when 'admin' then array[
      'dashboard','mpo','clients','finance','budgets','revenue-target','reports','calendar',
      'analytics','reminders','users','audit','invoice-wf','settings','dataviz','feed',
      'production','portal'
    ]::text[]
    when 'manager' then array[
      'dashboard','mpo','clients','finance','budgets','revenue-target','reports','calendar',
      'analytics','reminders','audit','invoice-wf','feed'
    ]::text[]
    when 'viewer' then array[
      'dashboard','mpo','clients','revenue-target','calendar','feed'
    ]::text[]
    when 'client' then array[
      'dashboard','revenue-target'
    ]::text[]
    else array['dashboard','mpo','clients','revenue-target','calendar','feed']::text[]
  end;
$$;

create or replace function public.admin_permissions()
returns text[]
language sql
immutable
as $$
  select public.role_permissions('admin');
$$;

update public.profiles
set permissions = public.role_permissions(role)
where role in ('admin', 'manager', 'viewer', 'client');

create or replace function public.enforce_role_permissions()
returns trigger
language plpgsql
as $$
begin
  new.permissions := public.role_permissions(new.role);
  return new;
end;
$$;

drop trigger if exists enforce_admin_permissions_on_profiles on public.profiles;
drop trigger if exists enforce_role_permissions_on_profiles on public.profiles;
create trigger enforce_role_permissions_on_profiles
  before insert or update of role, permissions on public.profiles
  for each row
  execute function public.enforce_role_permissions();

create or replace function public.sync_profile_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'name', nullif(new.name, ''),
      'role', new.role,
      'workspace_id', new.workspace_id
    ))
  where id = new.id;

  return new;
end;
$$;

update auth.users u
set raw_user_meta_data =
  coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(p.name, ''),
    'role', p.role,
    'workspace_id', p.workspace_id
  ))
from public.profiles p
where p.id = u.id;

drop trigger if exists sync_profile_auth_metadata_on_profiles on public.profiles;
create trigger sync_profile_auth_metadata_on_profiles
  after insert or update of name, role, workspace_id on public.profiles
  for each row
  execute function public.sync_profile_auth_metadata();

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_role         text;
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

  insert into public.profiles (id, workspace_id, name, role, permissions, initials)
  values (new.id, v_workspace_id, v_name, v_role, public.role_permissions(v_role), coalesce(nullif(v_initials, ''), '?'))
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        name         = case when coalesce(public.profiles.name, '') = '' then excluded.name else public.profiles.name end,
        role         = excluded.role,
        permissions  = public.role_permissions(excluded.role),
        initials     = case when coalesce(public.profiles.initials, '') in ('', '?') then excluded.initials else public.profiles.initials end;

  return new;
end;
$$;
