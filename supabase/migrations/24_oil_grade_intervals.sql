-- 24_oil_grade_intervals.sql
--
-- ALREADY APPLIED, and src/types/database.ts has been regenerated against it.
-- This file was written after the fact so the change has a record alongside
-- 21–23; it is a transcription, not the script that ran. The values, slugs and
-- labels below were read back from the live database and match it. Do not
-- re-run it blind — every statement is idempotent, but there is nothing here
-- the live schema does not already have.
--
-- One thing this file does NOT record as applied: the `> 0` check constraints.
-- They were not part of what ran. See the foot of the file, where they are
-- kept separately as statements still to run if wanted.
--
-- The oil change interval belongs to the grade, not to the service.
--
-- services.reminder_km/reminder_months are one pair per service, so every oil
-- change prefilled 5,000 km / 6 months whatever went in the engine. A full
-- synthetic customer was being called back at half the interval the oil is
-- rated for. Mineral, semi and full are three different products sold through
-- one service, and the number that separates them is the interval.
--
-- The service-level pair stays. It is still the answer for the 340-odd
-- services that have no grade at all, and it is still what a line prefills
-- from before a grade is picked.

-- ── the interval, on the grade ───────────────────────────────────────────
-- On lookup_values rather than a table of its own: a grade is already a lookup
-- row, and "how long this grade lasts" is a property of that row the same way
-- its label is. Both nullable, because only one list in the whole table has
-- intervals to carry — every other list leaves them null and the app reads
-- that as "no interval here" rather than as zero.

alter table public.lookup_values
  add column if not exists reminder_km integer,
  add column if not exists reminder_months integer;

comment on column public.lookup_values.reminder_km is
  'Distance this lookup value is good for. Populated for oil_grade only; null everywhere else, which the app reads as "this list carries no intervals". A prefill hint, never a rule — next-due is decided per job line.';

comment on column public.lookup_values.reminder_months is
  'Time this lookup value is good for, in months. Same nullability rule as reminder_km.';

-- ── the three grades ─────────────────────────────────────────────────────
-- Manufacturer service intervals, taken at the conservative end for Amman:
-- summer heat and short city trips are both hard on oil, so nothing here is
-- the optimistic number off the bottle.
--
-- The slugs are the short forms the list has always used — mineral, semi,
-- full — not the spelled-out product names.
--
-- An inline VALUES list, not a temp table: the SQL editor pools connections
-- and a temp table does not survive to the next statement.

update public.lookup_values as v
   set reminder_km     = i.reminder_km,
       reminder_months = i.reminder_months
  from (values
         ('mineral', 5000,  6),
         ('semi',    7500,  6),
         ('full',    10000, 12)
       ) as i (value, reminder_km, reminder_months)
 where v.list_key = 'oil_grade'
   and v.value    = i.value;

-- ── two Arabic labels ────────────────────────────────────────────────────
-- صناعي is "manufactured, industrial". اصطناعي is "synthetic". Semi and full
-- both had the first, which reads to a customer as though the shop is
-- describing a factory rather than the oil. Mineral (معدني) was already
-- right and is not touched.
--
-- Written as literals of the corrected text rather than a string replace, so
-- the file states the labels the database actually holds.

update public.lookup_values
   set label_ar = 'نصف اصطناعي'
 where list_key = 'oil_grade' and value = 'semi';

update public.lookup_values
   set label_ar = 'اصطناعي كامل'
 where list_key = 'oil_grade' and value = 'full';

-- ── how much the car is driven ───────────────────────────────────────────
-- A 10,000 km interval is 50 days for a taxi and nearly three years for a
-- weekend car. The months figure is a cap on oil that degrades sitting still;
-- it is not a second guess at when the distance runs out. Without this column
-- the cap is the only date available, which is why it is optional and why
-- nothing in the app requires it — a missing average makes the reminder less
-- precise, never wrong.
--
-- On vehicles rather than customers: a household with a commuter and a school
-- run does not have one average.

alter table public.vehicles
  add column if not exists km_per_day integer;

comment on column public.vehicles.km_per_day is
  'Roughly how many km a day this car does, as the owner answers it at the counter. Optional. Used to turn a grade''s distance interval into a date; null means only the months cap applies. Whole numbers — nobody answers this to a decimal place.';

-- ── after applying ───────────────────────────────────────────────────────
--   npx supabase gen types typescript --project-id nbbwtberzbkgikbkvsiq \
--     > src/types/database.ts
--
-- Verify the live rows still match this file:
--
--   select value, label_en, label_ar, reminder_km, reminder_months
--     from public.lookup_values
--    where list_key = 'oil_grade'
--    order by sort_order;
--
--   mineral | Mineral        | معدني        | 5000  | 6
--   semi    | Semi-synthetic | نصف اصطناعي  | 7500  | 6
--   full    | Full synthetic | اصطناعي كامل | 10000 | 12

-- ── NOT APPLIED: the positive-value constraints ──────────────────────────
-- The three columns above are plain nullable integers on the live database.
-- Nothing stops a zero or a negative going into any of them.
--
-- Zero is the case that matters. km_per_day of 0 divides a distance interval
-- into a date that never arrives, and reminder_km of 0 makes a line due at the
-- reading it was just serviced at. The app rejects both on the way in —
-- parseOptionalPositiveInteger on the vehicle form, and gradeDue() guards
-- km_per_day > 0 before dividing — so nothing is currently broken. These would
-- move that floor into the database, where an import or a SQL-editor edit
-- cannot go around it.
--
-- Run these to add them. Each validates the rows already there, so a failure
-- means a bad value is already stored and wants fixing first.
--
--   alter table public.lookup_values
--     add constraint lookup_values_reminder_km_positive
--       check (reminder_km is null or reminder_km > 0),
--     add constraint lookup_values_reminder_months_positive
--       check (reminder_months is null or reminder_months > 0);
--
--   alter table public.vehicles
--     add constraint vehicles_km_per_day_positive
--       check (km_per_day is null or km_per_day > 0);
--
-- If they are run, move them up into the alter statements above and delete
-- this section, so the file keeps recording only what is actually applied.
