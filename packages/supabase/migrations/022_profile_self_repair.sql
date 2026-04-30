-- Migration 022 - Allow signed-in users to repair a missing own profile row.
-- The auth trigger normally creates profiles, but this keeps the app from
-- getting stuck if an older user was created before the trigger/policies existed.

drop policy if exists "profiles: insert own" on profiles;

create policy "profiles: insert own"
  on profiles for insert
  with check (id = auth.uid());
