-- Migration 018 - Ensure invited and newly created users receive permissions from role

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

  v_name := coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '');
  v_initials := upper(left(split_part(trim(v_name), ' ', 1), 1) || left(split_part(trim(v_name), ' ', 2), 1));

  v_permissions := case v_role
    when 'admin' then array[
      'dashboard','mpo','clients','finance','budgets','reports','calendar',
      'analytics','reminders','users','audit','invoice-wf','settings','dataviz','feed'
    ]
    when 'manager' then array[
      'dashboard','mpo','clients','finance','budgets','reports','calendar',
      'analytics','reminders','audit','invoice-wf','feed'
    ]
    when 'viewer' then array[
      'dashboard','mpo','clients','calendar','feed'
    ]
    when 'client' then array[
      'dashboard'
    ]
    else array['dashboard','mpo','clients','calendar','feed']
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
