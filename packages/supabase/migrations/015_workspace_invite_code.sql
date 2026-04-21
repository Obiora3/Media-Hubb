-- Migration 015 — Workspace invite codes
-- Run in Supabase Dashboard → SQL Editor

-- 1. Add invite_code column
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS invite_code text unique;

-- 2. Generate codes for existing workspaces
UPDATE workspaces
  SET invite_code = upper(substring(md5(id::text), 1, 8))
  WHERE invite_code IS NULL;

-- 3. Make it required with a default for new workspaces
ALTER TABLE workspaces ALTER COLUMN invite_code SET NOT NULL;
ALTER TABLE workspaces ALTER COLUMN invite_code
  SET DEFAULT upper(substring(md5(gen_random_uuid()::text), 1, 8));

-- 4. Public function — lets unauthenticated users look up a workspace by code
--    Returns only id + name (no sensitive data)
CREATE OR REPLACE FUNCTION get_workspace_by_invite_code(code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name FROM workspaces
  WHERE upper(invite_code) = upper(trim(code))
  LIMIT 1;
$$;

-- 5. Admin-only function to regenerate a workspace's invite code
CREATE OR REPLACE FUNCTION regenerate_workspace_invite_code(ws_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND workspace_id = ws_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only workspace admins can regenerate the invite code';
  END IF;

  new_code := upper(substring(md5(gen_random_uuid()::text), 1, 8));
  UPDATE workspaces SET invite_code = new_code WHERE id = ws_id;
  RETURN new_code;
END;
$$;
