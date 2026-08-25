-- 23_subcontractor_names_ar.sql
--
-- ALREADY APPLIED per the instruction that accompanied it — but see the note
-- at the foot of this file: src/types/database.ts does not yet carry the
-- column, so either this has not run or the types were regenerated before it
-- did. Confirm before treating this file as history.
--
-- Subcontractor names become a bilingual pair.
--
-- Pattern 1, not Pattern 2. These are people and firms with Arabic names, and
-- the Latin form is a transliteration of the original — the same relationship
-- customers.name_en/name_ar has. That is why a second column is right here and
-- wrong for vehicles.make, where "Camry" is the canonical identifier worldwide
-- and كامري is a spelling of it rather than a translation.
--
-- `name` stays the identifier and stays NOT NULL: the picker orders by it, and
-- an Arabic-only subcontractor would sort unpredictably against Latin ones.

alter table public.subcontractors
  add column if not exists name_ar text;

comment on column public.subcontractors.name_ar is
  'Arabic name. Nullable — the Latin name is the identifier, this is the pair. Displayed via localised(name, name_ar) with fallback to name.';

-- ── after applying ───────────────────────────────────────────────────────
--   npx supabase gen types typescript --project-id nbbwtberzbkgikbkvsiq \
--     > src/types/database.ts
--
-- As of writing, the generated types have subcontractors as
-- { active, default_rate, id, name, notes, phone, type } with no name_ar,
-- while customers, services and service_categories all carry theirs. The app
-- cannot select or insert the column until that regeneration lands.
