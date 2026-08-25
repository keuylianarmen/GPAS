-- 22_subcontractors.sql
--
-- ALREADY APPLIED. This file is the record, not a pending change — do not run
-- it against a database that has it. src/types/database.ts is regenerated and
-- already carries `type: string | null`.
--
-- Subcontractors existed as a table with no way into it: nothing in the app
-- ever queried it, and subcontractor_id was read for display and never
-- written. This is what made it usable from the job line.

-- ── type stops being required ────────────────────────────────────────────
-- It was NOT NULL with no default, so any insert had to supply a classifier
-- nothing in the app knew the valid values for. Nullable, the add form can
-- ask for a name and nothing else.
alter table public.subcontractors
  alter column type drop not null;

-- ── the write policy splits by what the write does ───────────────────────
-- Adding one is part of entering a job line, so any staff member doing the
-- work can do it. Editing or removing one rewrites history on every line that
-- points at it, which is a manager's call.
--
-- This is deliberately unlike lookup_values, where lv_write requires
-- is_manager() for all of INSERT, UPDATE and DELETE — AddMakeDialog offers
-- its button to everyone and a technician gets a raw Postgres error back.
drop policy if exists sub_write on public.subcontractors;

create policy sub_insert on public.subcontractors
  for insert to authenticated with check (is_staff());

create policy sub_update on public.subcontractors
  for update to authenticated using (is_manager()) with check (is_manager());

create policy sub_delete on public.subcontractors
  for delete to authenticated using (is_manager());

-- ── seed ─────────────────────────────────────────────────────────────────
-- The applied migration inserted 16 subcontractors, taking the table to 18
-- rows. Those values are NOT reproduced here: they were written directly
-- against the live database and were not available when this file was
-- reconstructed, so inventing them would put wrong names in version control.
--
-- To capture them for the record, run this and paste the result in below:
--
--   select 'insert into public.subcontractors (name, type, phone, default_rate, notes, active) values'
--     || string_agg(format('(%L,%L,%L,%L,%L,%L)', name, type, phone, default_rate, notes, active), ',' order by name)
--     || ' on conflict do nothing;'
--   from public.subcontractors;
