-- 0003_rls.sql's `revoke update (role) on public.profiles from
-- authenticated` was a no-op: Supabase grants every new table a
-- TABLE-level privilege to authenticated (`alter default privileges
-- ... grant all on tables to ...`, applied automatically at table
-- creation), and a column-specific REVOKE only removes a column-level
-- ACL entry, which never existed here. The table-level grant still
-- covered every column, role included, so members could self-promote
-- via a direct `update profiles set role = 'admin'`.
--
-- Fix: remove the table-level UPDATE grant entirely and replace it
-- with an explicit column-level grant that excludes `role`. With no
-- table-level UPDATE left, there's nothing for the column-level ACL
-- to be overridden by.
revoke update on public.profiles from authenticated;
grant update (display_name, equipment, days_per_week, level) on public.profiles to authenticated;
