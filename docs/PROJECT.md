# Grand Prix Automotive Service — project brief

Read this first when picking the project up cold.

---

## The business

Grand Prix Tire Center, established 1987, Saleem Bin Al-Hareth St., Wadi Al-Seer, Amman.
Armen Keuylian is taking over from his father. The shop is rebranding as **Grand Prix
Automotive Service** as a trade name — the legal entity keeps the original name to avoid
renewing the lease with a difficult landlord. Legal name appears small on the storefront
and in the invoice footer.

Three people work there: Armen and his father, both English-preferring, and an assistant
who prefers Arabic and does most of the data entry. That is why the app is bilingual.

Five-part modernisation plan: office refurbishment, storefront, new machines, **this CRM**,
and the rebrand. The CRM was sequenced first because it is the cheapest and compounds.

## Why this exists

Customers come once and are never contacted again. The old system was a 348-column Excel
sheet with a "Next Service" column nobody acted on. Twenty customers visited in June 2025;
none were followed up. The single purpose of this build is that a car due for an oil
change gets a WhatsApp message without anyone remembering.

Everything else — job records, stats, the service catalogue — is in service of that.

---

## Stack

- **Supabase** — Postgres, RLS, Edge Functions. All business logic in the database.
- **Vite + React + TypeScript** — `~/Projects/GPAS`, GitHub `keuylianarmen/GPAS` (private)
- **Vercel** — auto-deploys from `main`. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **Claude Code** — all application code is written through it
- **recharts** — Stats only, lazy-loaded

## What is built

Seven screens, all complete:

**Dashboard** — stat cards, recent jobs, due reminders, contact-health counts
**New job** — four steps: customer → vehicle → services → payment. Collapsing pickers,
vehicle preselection, service picker with usage-ranked shortcuts
**Jobs** — filters, edit dialog with vehicle swap, admin-only delete
**Customers** — search, make filter, multi-vehicle add, reminder mutes, contact flags
**Reminders** — overdue / this week / next week / later / dismissed, mark sent, couldn't
reach, inline due editing, dismiss with undo
**Services** — 347 services in 17 categories, bilingual names with machine translation,
edit and deactivate
**Stats** — revenue by category, over time, top services, retention, lapsed customers

Bilingual throughout: 440+ UI strings, RTL verified against UAX#9, `Intl.PluralRules`
for Arabic's six plural categories.

## Data in the system

21 jobs imported from the legacy Excel CRM (June 2025), 52 job lines, 20 customers with
Arabic names filled by hand, 20 vehicles, 25 pending reminders — several deliberately
overdue, forming a lapsed-customer call list. Two subcontractors: Abu-Ahmad Body Shop
and Mahmoud, a Volvo specialist.

Plates were lost in the import — Excel had stored them as decimals. They get added as
cars return.

---

## Open items, in priority order

### 1. Meta Business verification — NOT STARTED

This blocks the entire purpose of the build and runs on Meta's clock, not yours.
Days to weeks. No code dependency.

1. business.facebook.com → create a Business Portfolio
2. Business Verification → upload Grand Prix Tire Center registration documents
   (the registered entity, not the trade name)
3. A phone number never used on regular WhatsApp — likely a new SIM
4. Arabic message templates, submitted for approval, a day or two each. They get
   rejected for sounding promotional.
5. A Supabase Edge Function on a daily cron reading `v_reminders_live` where
   `bucket = 'due'` and `whatsapp_opt_in`, sending, then calling `log_reminder_send`

Step 5 is an afternoon. Steps 1–4 are the long pole.

### 2. Remaining bilingual work

- Vehicle model and brand: Arabic input should normalise to the Latin canonical form
- `vehicles.make` displays Latin in Arabic mode — display-only fix via `lookup_values`
- Customer name transliteration on entry, human-confirmed

### 3. Have the assistant use the Arabic version

The 440 Arabic strings were written from key names with shop vernacular inferred from the
seed data. The person doing daily entry should review them before more is built on top.

### 4. Deferred

- `parts_catalog` is empty — needs dedup and seeding
- JoFotara e-invoicing (mandatory in Jordan, clearance model, UBL 2.1) — deliberately
  not built into the CRM
- Mobile layouts — desktop-only by design; worth revisiting for read-only use
- Margin views — need real recorded costs, not `est_minutes × shop_hourly_rate`
- Trade-name registration and the lease alterations clause — check with a lawyer

---

## Working style that has worked

Armen relays complete, self-contained prompts to Claude Code, which reports back with
verification notes and flags. Those flags are usually right and deserve substantive
answers — several of this project's better decisions came from Claude Code pushing back.

Armen asks "is this clean? / does this address the root cause?" often. That question has
caught four bad proposals. It should be answered honestly, including when the answer is
that the proposal was wrong.
