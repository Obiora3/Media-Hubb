-- Migration 014 — Fix handle_new_user trigger to honour invite workspace_id + role
-- Run in Supabase Dashboard → SQL Editor

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
  v_role         text;
begin
  -- Use workspace_id from invite metadata if present, otherwise fall back to first workspace
  v_workspace_id := (new.raw_user_meta_data->>'workspace_id')::uuid;

  if v_workspace_id is null then
    select id into v_workspace_id
    from public.workspaces
    order by created_at
    limit 1;
  end if;

  -- Use role from invite metadata if present, otherwise default to viewer
  v_role := coalesce(new.raw_user_meta_data->>'role', 'viewer');

  -- Validate role value
  if v_role not in ('admin', 'manager', 'viewer', 'client') then
    v_role := 'viewer';
  end if;

  insert into public.profiles (id, workspace_id, role)
  values (new.id, v_workspace_id, v_role)
  on conflict (id) do update
    set workspace_id = excluded.workspace_id,
        role         = excluded.role;

  return new;
end;
$$;
