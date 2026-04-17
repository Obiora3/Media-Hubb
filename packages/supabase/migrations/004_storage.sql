-- ═══════════════════════════════════════════════════════════════════
--  Migration 004 — Supabase Storage
--  Run in Supabase SQL Editor after 001–003.
--
--  Step 1: Run this SQL
--  Step 2: Create the "documents" bucket in Storage dashboard
--          (Storage → New bucket → Name: "documents" → Private)
-- ═══════════════════════════════════════════════════════════════════

-- RLS policies for the documents storage bucket
-- (These apply once the bucket is created in the dashboard)

-- Allow workspace members to upload documents
create policy "workspace members can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );

-- Allow workspace members to read documents in their workspace folder
create policy "workspace members can read"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete their own uploads
create policy "members can delete documents"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and auth.role() = 'authenticated'
  );
