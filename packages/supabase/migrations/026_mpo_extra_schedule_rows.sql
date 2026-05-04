-- Migration 026 - Store additional MPO schedules independently

alter table public.mpos
  add column if not exists extra_schedule_rows jsonb not null default '[]'::jsonb;
