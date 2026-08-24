# Handoff — Grand Prix CRM

Paste this into a new chat to continue.

---

## Who and what

I'm Armen Keuylian. I'm taking over my father's shop — **Grand Prix Tire Center**,
established 1987, Wadi Al-Seer, Amman, Jordan. We're rebranding as **Grand Prix
Automotive Service** as a trade name; the legal entity keeps the original name to avoid
renewing the lease with a difficult landlord.

Three of us work there: me and my father, both English-preferring, and an assistant who
prefers Arabic and does most of the data entry. That's why the app is bilingual.

I've built a CRM over the past sessions. **The point of it is WhatsApp service reminders** —
customers came once in June 2025 and were never contacted again. Everything else in the
app exists to feed that.

## Repo docs — read these first

- **`CLAUDE.md`** (repo root) — invariants, conventions, gotchas
- **`docs/PROJECT.md`** — business context, what's built, open items
- **`docs/SCHEMA.md`** — tables, views, triggers, functions
- **`docs/DECISIONS.md`** — design rationale, including four proposals made and withdrawn

Ask me to paste any of them. `DECISIONS.md` matters most — it records what was tried and
was wrong.

## Stack

Supabase (Postgres, RLS, Edge Functions) + Vite/React/TypeScript on Vercel. Repo
`keuylianarmen/GPAS`, local `~/Projects/GPAS`. All application code goes through **Claude
Code** — you write complete, self-contained relay prompts, I pass them along, Claude Code
reports back with verification notes and flags.

20 migrations applied. Types regenerate with
`npx supabase gen types typescript --project-id <id> > src/types/database.ts`.

## State

Seven screens complete: Dashboard, New job, Jobs, Customers, Reminders, Services, Stats.

21 jobs imported from the old Excel CRM (June 2025), 20 customers with Arabic names filled
by hand, 20 vehicles, 347 services in 17 categories, 25 pending reminders — several
deliberately overdue as a lapsed-customer call list.

## The three hard invariants

1. **The app never writes to the `reminders` table.** Triggers create and update reminders
   from job line data. The app updates `status` and calls RPCs.
2. **Totals are never stored.** `v_job_totals` computes them.
3. **PostgREST array inserts need uniform keys across every row**, or NULL is written into
   rows missing a key another row has. This caused a production bug.

---

# The bilingual thread — where we actually left off

This is the live piece of work. The distinctions matter; getting them wrong corrupts data.

## Three field patterns, never to be confused

**Pattern 1 — bilingual pairs. Translate.**
Columns exist for both languages; both are stored and correct; the UI picks one via
`localised(en, ar)` with fallback to the other.

`customers.name_en/name_ar` · `services.name_en/name_ar` · `service_categories` ·
`lookup_values.label_en/label_ar`

**Pattern 2 — canonical Latin identifiers. Normalise, never translate.**
One column, no `_ar` counterpart, and there shouldn't be one. Toyota calls it "Camry"
worldwide; كامري is an Arabic *spelling* of a Latin word, not a translation. Storing both
splits the typeahead and breaks fleet counts — exactly what "Range Rover" stored as a make
did before it was normalised to Land Rover.

`vehicles.make` · `vehicles.model` · `details.tire_brand` · `details.tire_size` ·
`details.fluid_brand`

**Pattern 3 — free prose. Leave alone.**
Written by one person about one job. Translating risks changing what it says.

Job descriptions · line notes · customer notes · mute reasons

## What's done

**UI strings — complete.** 440+ keys extracted behind `t('key')`, English and Arabic
catalogues, `StringKey` derived from English so a missing Arabic key is a compile error.
Empty Arabic values fall back to English. Plurals go through `Intl.PluralRules` via
`tn(count, base)` with `.zero/.one/.two/.few/.many/.other` — Arabic uses all six.

**CSS — complete and verified.** Fully logical properties, zero physical ones. Audited
rather than assumed.

**RTL — verified against a real UAX#9 implementation, not eyeballed.** Key finding:
`dir="auto"` alone is *not* enough. A plate next to Arabic text has its halves swapped.
So there are two classes:

- `.num` — `direction: ltr; unicode-bidi: isolate`, for bare figures (plates, phones,
  prices, dates)
- `.figures` — mono font only, plus `dir="auto"`, for sentences *containing* figures.
  Forcing LTR on a sentence detaches the unit from its number
  (`مستحق عند 105,000 km` becomes `105,000 دنع قحتسم km`).

**Language toggle** in the header, `localStorage` key `gpas.locale`, sets `lang` and `dir`
on the document root. Numbers stay Latin digits, dates stay ISO, in both languages.

**Service names — complete.** `ServiceDialog` (renamed from `AddServiceDialog`) has one
"Service name" field. On submit the script is detected via `\p{Script=Arabic}`, the
`translate-service` Edge Function is called, the typed name goes to its matching column
and the translation to the other. Edit mode shows both names — active locale primary,
other language secondary and editable — and does *not* re-translate, since a hand
correction is the intended value. The Services header shows a count of services missing
`name_ar`, linking to a filtered view.

**`translate-service` Edge Function — deployed and working.** POST `{ name, categoryId }`
with the caller's auth header. Verifies staff membership, detects script, pulls up to 12
same-category bilingual examples from `services` as few-shot context, calls Claude Haiku
4.5, rejects a reply in the wrong script. Secret is `ANTHROPIC_API_KEY`.

Live test results:

    غسيل ردييتر     ->  Radiator flush      (ar -> en)
    Radiator flush  ->  غسيل الردييتر        (en -> ar)

Both correct. The few-shot examples from the shop's own catalogue are what keeps the
register right — it produces غسيل ردييتر rather than a formal MSA construction.

## What's open, with detail

### A. `AddMakeDialog` — unanswered question

I asked Claude Code to report what this dialog does with Arabic input rather than change
it, and never got the report. **Start here — it's a live bug of unknown size.**

`vehicles.make` is a single free-text column storing the display name (`label_en` from
`lookup_values`). The dialog inserts into `lookup_values` with a slug for `value` and the
typed name as `label_en`. If someone types تويوتا, it becomes a make named تويوتا sitting
alongside Toyota, and the fleet counts split.

Pattern 2 applies: the make list should be normalised to Latin. Likely fix is requiring
Latin in that dialog — there's already a `make.needLatin` string key, so something exists;
check what it actually does — and filling `label_ar` separately.

### B. `vehicles.make` displays Latin in Arabic mode

`lookup_values` has تويوتا as `label_ar`, but `vehicles.make` stores the Latin label, so
Arabic mode shows "Toyota". Display-only fix: map the stored value back through the lookup
list. No data change.

### C. Model and brand normalisation — Pattern 2, needs a *different* LLM call

`vehicles.model`, `details.tire_brand`, `details.fluid_brand`, `details.tire_size`.

If someone types كامري, the app should suggest "Camry" and store that. This is
**transliteration/normalisation, not translation** — the `translate-service` prompt would
translate the *meaning*, which is wrong for a proper noun.

Two things before reaching for an LLM at all:

1. Check the existing typeahead views first (`v_vehicle_models`, `v_tire_brands`,
   `v_fluid_brands`). If "Camry" is already in the data, match it rather than calling out.
2. Only call the LLM when nothing matches.

**Open design question:** extend `translate-service` with a `mode` parameter
(`translate` | `transliterate`), or deploy a second function. One function means one
secret and one deployment; two means neither prompt gets muddied. Not decided.

### D. Customer name transliteration — the hardest one

`customers.name_en` / `name_ar` is Pattern 1 structurally, but the operation is
transliteration, not translation. يوسف الوادي becomes Yousef Al-Wadi.

**This one genuinely needs human confirmation**, unlike service names. Arabic omits short
vowels, so the mapping is one-to-many in both directions: محمد is Mohammad, Mohammed,
Muhammad, Mohamad. يوسف is Yousef, Youssef, Yusuf, Yousif. There is no single right
answer, and a customer's name is theirs.

Decided last session: **search-time transliteration is rejected.** Someone searching يوسف,
finding nothing, and creating a duplicate customer is the worst outcome. Instead:

1. Search both `name_en` and `name_ar` always, regardless of UI language — biggest win,
   costs nothing
2. Lean on phone numbers, which are script-neutral and already searchable
3. Transliterate at entry with the result shown for confirmation, not written silently

The customer form already has two name fields (`customerForm.nameEn` and
`customerForm.nameAr` exist as string keys) requiring at least one, so the structure is
there. What's missing is the suggestion.

**Also unbuilt:** `normalize_ar(text)` exists in the database — it unifies alef forms
(أ إ آ into ا), ya/alef-maqsura, ta-marbuta, hamza carriers, and strips diacritics and
tatweel. Indexes were created on `customers.name_ar` and `services.name_ar`. **Nothing
uses it yet.** Arabic-to-Arabic search is currently broken for أحمد vs احمد. That's a
deterministic fix, no LLM, and it's cheap.

### E. Assistant review of the Arabic strings

I wrote the 440 Arabic values from key names, with shop vernacular inferred from the seed
data (تيل، ترصيص، بنشر، ردييتر). My assistant does the daily entry and hasn't seen them.

Judgment calls she may overrule: **أمر عمل** vs شغلة for "job", **زبون** vs عميل for
"customer", **يناير-style** month names vs Levantine كانون الثاني, `brand.name` left as
Latin "GRAND PRIX", and `nav.language` set to "English" on the assumption it labels the
switch target.

**A placeholder-parity check between the English and Arabic catalogues has not been run.**
The Arabic values were written from key names, so placeholders (`{name}`, `{count}`,
`{km}`, `{date}`, `{total}`) are inferred rather than copied. Worth having Claude Code
verify every key's placeholder set matches, and report mismatches rather than guessing.

---

## Everything else, in priority order

**1. Meta Business verification — not started.** This blocks the entire purpose of the
build, takes days to weeks on Meta's clock, and needs no code. business.facebook.com,
Business Portfolio, Business Verification with Grand Prix Tire Center registration
documents. Then a SIM never used on WhatsApp, then Arabic message templates for approval
(they get rejected for sounding promotional), then an Edge Function on a cron reading
`v_reminders_live` where `bucket = 'due'` and `whatsapp_opt_in`, sending, then calling
`log_reminder_send`.

Please keep raising this. The last session raised it repeatedly and it still hasn't
started.

**2. The bilingual items above**, roughly in order A, B, E, C, D.

**3. Deferred:** `parts_catalog` seeding, JoFotara e-invoicing (mandatory in Jordan,
clearance model, UBL 2.1, deliberately not in the CRM), mobile layouts (desktop-only by
design), margin views once real costs are recorded rather than
`est_minutes × shop_hourly_rate`.

---

## How I work

I ask "is this clean?" and "does this address the root cause?" a lot. Answer honestly,
including when the honest answer is that your own proposal was wrong — that question
caught four bad ones last session.

Keep explanations short when I ask for short. Give complete relay prompts for Claude Code,
not fragments. When Claude Code pushes back, take it seriously; several of the better
decisions came from it.

I accumulate uncommitted work. Remind me to commit and push.