-- 24_oil_grade_intervals.sql
--
-- ALREADY APPLIED, and src/types/database.ts has been regenerated against it —
-- lookup_values carries reminder_km/reminder_months and vehicles carries
-- km_per_day in the generated types. This file was written after the fact so
-- the change has a record alongside 21–23; it is a transcription, not the
-- script that ran. Do not re-run it blind. The verification query at the foot
-- is what confirms the live rows match what is written here.
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
  add column if not exists reminder_km integer
    check (reminder_km is null or reminder_km > 0),
  add column if not exists reminder_months integer
    check (reminder_months is null or reminder_months > 0);

comment on column public.lookup_values.reminder_km is
  'Distance this lookup value is good for. Populated for oil_grade only; null everywhere else, which the app reads as "this list carries no intervals". A prefill hint, never a rule — next-due is decided per job line.';

comment on column public.lookup_values.reminder_months is
  'Time this lookup value is good for, in months. Same nullability rule as reminder_km.';

-- ── the three grades ─────────────────────────────────────────────────────
-- Manufacturer service intervals, taken at the conservative end for Amman:
-- summer heat and short city trips are both hard on oil, so nothing here is
-- the optimistic number off the bottle.
--
-- An inline VALUES list, not a temp table — the SQL editor pools connections
-- and a temp table does not survive to the next statement.

update public.lookup_values as v
   set reminder_km     = i.reminder_km,
       reminder_months = i.reminder_months
  from (values
         ('mineral',        5000,  6),
         ('semi_synthetic', 7500,  6),
         ('full_synthetic', 10000, 12)
       ) as i (value, reminder_km, reminder_months)
 where v.list_key = 'oil_grade'
   and v.value    = i.value;

-- ── two Arabic labels ────────────────────────────────────────────────────
-- صناعي is "manufactured, industrial". اصطناعي is "synthetic". Two of the
-- three grades had the first, which reads to a customer as though the shop is
-- describing a factory rather than the oil. Mineral (معدني) was already right.
--
-- Written as a targeted replace rather than three literals so it is idempotent
-- and does not depend on the exact wording either label had.

update public.lookup_values
   set label_ar = replace(label_ar, 'صناعي', 'اصطناعي')
 where list_key = 'oil_grade'
   and label_ar like '%صناعي%'
   and label_ar not like '%اصطناعي%';

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
  add column if not exists km_per_day integer
    check (km_per_day is null or km_per_day > 0);

comment on column public.vehicles.km_per_day is
  'Roughly how many km a day this car does, as the owner answers it at the counter. Optional. Used to turn a grade''s distance interval into a date; null means only the months cap applies. Whole numbers — nobody answers this to a decimal place.';

-- ── after applying ───────────────────────────────────────────────────────
--   npx supabase gen types typescript --project-id nbbwtberzbkgikbkvsiq \
--     > src/types/database.ts
--
-- Verify the live rows match this file:
--
--   select value, label_en, label_ar, reminder_km, reminder_months
--     from public.lookup_values
--    where list_key = 'oil_grade'
--    order by sort_order;
--
-- Expected: mineral 5000/6, semi_synthetic 7500/6, full_synthetic 10000/12,
-- and no label_ar containing صناعي without the alif. Any row that came back
-- with null intervals has a `value` this file guessed wrong — fix the VALUES
-- list here to match, and re-run this statement only.
