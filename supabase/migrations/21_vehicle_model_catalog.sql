-- 21_vehicle_model_catalog.sql
--
-- A per-make list of the models a manufacturer actually sells, so the model
-- field can suggest something on a shop with 21 jobs of history. v_vehicle_models
-- only knows what has already been typed here, which on a new make is nothing.
--
-- Two tables, because "no rows for this make" is ambiguous on its own: nobody
-- has asked yet, or somebody asked and the answer was empty. Only the fetch
-- record can tell those apart, and without it a make with no lineup would be
-- re-fetched by every staff member forever.
--
-- Rows are written by the translate-service edge function using the service
-- role. There is deliberately no client insert policy: this is a
-- machine-produced reference list with one producer, unlike lookup_values,
-- where an open insert path is how the make list came to hold near-duplicates.

-- ── the catalogue ────────────────────────────────────────────────────────
create table if not exists public.vehicle_model_catalog (
  id         uuid primary key default gen_random_uuid(),
  -- Plain text, not a foreign key, exactly as vehicles.make is: the make list
  -- is a soft lookup and a car can carry a make nobody has added to it yet.
  make       text not null,
  -- The identifier. Latin always — كامري is a spelling of Camry, not a
  -- translation of it, and vehicles.model stores this value verbatim.
  name_en    text not null,
  -- A spelling aid for the typeahead. Nullable for the same reason
  -- services.name_ar is: an entry with no Arabic is still usable.
  name_ar    text,
  origin     text not null default 'generated'
               check (origin in ('generated', 'entered')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.staff (id)
);

-- The only lookup this table serves: every model for one make, in name order.
create index if not exists vehicle_model_catalog_make_idx
  on public.vehicle_model_catalog (make, name_en)
  where active;

-- Case-folded, so a re-fetch or a hand-added "camry" cannot sit beside "Camry".
create unique index if not exists vehicle_model_catalog_make_name_idx
  on public.vehicle_model_catalog (make, lower(name_en));

-- ── the record that a make has been asked about ──────────────────────────
create table if not exists public.vehicle_model_fetches (
  -- One attempt per make, ever, shared by all staff.
  make        text primary key,
  fetched_at  timestamptz not null default now(),
  -- Zero is a real answer: the make was asked about and had no confident
  -- lineup. A failed call writes no row at all, so it is retried.
  model_count integer not null default 0,
  fetched_by  uuid references public.staff (id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.vehicle_model_catalog enable row level security;
alter table public.vehicle_model_fetches enable row level security;

create policy vmc_read on public.vehicle_model_catalog
  for select to authenticated using (is_staff());

create policy vmf_read on public.vehicle_model_fetches
  for select to authenticated using (is_staff());

-- No insert, update or delete policy on either table. The service role
-- bypasses RLS; the client cannot write here at all.

-- ── grants ───────────────────────────────────────────────────────────────
-- Granted deliberately rather than inherited from default privileges.
revoke all on public.vehicle_model_catalog from anon, authenticated;
revoke all on public.vehicle_model_fetches from anon, authenticated;

grant select on public.vehicle_model_catalog to authenticated;
grant select on public.vehicle_model_fetches to authenticated;

grant select, insert on public.vehicle_model_catalog to service_role;
grant select, insert, update on public.vehicle_model_fetches to service_role;

-- ── documentation ────────────────────────────────────────────────────────
comment on table public.vehicle_model_catalog is
  'Models a manufacturer sells, per make. Written only by the translate-service edge function under the service role. Distinct from v_vehicle_models, which is what this shop has actually entered.';
comment on column public.vehicle_model_catalog.name_en is
  'Canonical Latin name. This is the value vehicles.model stores.';
comment on column public.vehicle_model_catalog.origin is
  'generated = produced by the model; entered = put there by a person.';
comment on table public.vehicle_model_fetches is
  'One row per make that has been asked about. model_count = 0 means asked and genuinely empty; no row means never asked.';
