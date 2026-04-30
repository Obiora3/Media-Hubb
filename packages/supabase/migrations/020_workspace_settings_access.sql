-- ═══════════════════════════════════════════════════════════════════
--  Migration 020 — Workspace settings: manager write access +
--                  revenue-target permission for all roles
-- ═══════════════════════════════════════════════════════════════════

-- 1. Allow admins AND managers to update workspace settings
--    (previously admin-only, which silently blocked manager revenue-target saves)
drop policy if exists "workspaces: update admin only"     on workspaces;
drop policy if exists "admins can update workspace"       on workspaces;  -- from 005

create policy "workspaces: update admin or manager"
  on workspaces for update
  using (
    id = my_workspace_id()
    and exists (
      select 1 from profiles
      where id = auth.uid() and role in ('admin', 'manager')
    )
  );

-- 2. Backfill revenue-target permission for existing manager and viewer profiles
--    Migration 018 trigger omitted it; the JS ROLE_PERMISSIONS already has it but
--    users created before this fix have stale stored permissions in the DB.
update profiles
set permissions = array_append(permissions, 'revenue-target')
where 'revenue-target' != all(permissions)
  and role in ('admin', 'manager', 'viewer', 'client');

-- 3. Update the handle_new_user trigger so future signups also receive it
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
    when 'admin' then array[
      'dashboard','mpo','clients','finance','budgets','revenue-target','reports','calendar',
      'analytics','reminders','users','audit','invoice-wf','settings','dataviz','feed'
    ]
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
