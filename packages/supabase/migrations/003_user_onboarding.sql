-- ═══════════════════════════════════════════════════════════════════
--  Migration 003 — User Onboarding
--  Run in Supabase SQL Editor after 001 + 002.
--
--  Changes:
--   1. handle_new_user trigger — auto-assigns first workspace so new
--      signups see data immediately (no manual SQL needed).
--   2. RLS policy — allow admins/managers to read all profiles in
--      their workspace (needed for Users page live query).
--   3. RLS policy — allow admins to update any profile in their
--      workspace (role management from the UI).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Update trigger to auto-assign first workspace ─────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_workspace_id uuid;
begin
  -- Grab the first workspace (covers the seeded MediaHub Nigeria workspace)
  select id into v_workspace_id
  from public.workspaces
  order by created_at
  limit 1;

  insert into public.profiles (id, workspace_id)
  values (new.id, v_workspace_id)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ── 2. Allow admins/managers to read all profiles in their workspace ──────────
drop policy if exists "workspace members can read profiles" on profiles;
create policy "workspace members can read profiles"
  on profiles for select
  using (workspace_id = my_workspace_id());

-- ── 3. Allow admins to update any profile in their workspace ─────────────────
drop policy if exists "admins can update profiles" on profiles;
create policy "admins can update profiles"
  on profiles for update
  using (
    workspace_id = my_workspace_id()
    and exists (
      select 1 from profiles self
      where self.id = auth.uid()
        and self.role = 'admin'
    )
  );

-- ── 4. Allow admins to delete (remove) profiles in their workspace ────────────
drop policy if exists "admins can delete profiles" on profiles;
create policy "admins can delete profiles"
  on profiles for delete
  using (
    workspace_id = my_workspace_id()
    and id <> auth.uid()           -- cannot remove yourself
    and exists (
      select 1 from profiles self
      where self.id = auth.uid()
        and self.role = 'admin'
    )
  );
