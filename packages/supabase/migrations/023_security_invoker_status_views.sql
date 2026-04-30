-- Migration 023 - Make status views respect the querying user's RLS policies.
-- Supabase Advisor flags SECURITY DEFINER views because they execute with the
-- view owner's permissions. SECURITY INVOKER keeps access checks on invoices
-- and payables tied to the signed-in user.

alter view if exists public.invoices_with_status
  set (security_invoker = true);

alter view if exists public.payables_with_status
  set (security_invoker = true);
