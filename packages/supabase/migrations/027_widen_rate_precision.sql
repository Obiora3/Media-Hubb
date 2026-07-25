-- Migration 027 - Allow rate-per-spot to carry more than 2 decimal places
--
-- ros.rate and mpos.rate were numeric(15,2), so a rate like 69789.473
-- (e.g. from an imported/blended figure) was silently rounded down to
-- 69789.47 on save. The rate is an input multiplier, not a money total,
-- so widen its scale to preserve what was actually entered.

alter table public.ros
  alter column rate type numeric(15,4);

alter table public.mpos
  alter column rate type numeric(15,4);
