# Design decisions

Why things are the way they are. Includes proposals that were made and withdrawn — those
matter most, because without them someone rebuilds the same mistake.

---

## Reminders

**Keyed on `service_id`, not a reminder type.**
A `reminder_types` lookup was built in migration 06 and removed in 08. It grouped front
and rear brake pads under one type, so replacing the fronts would supersede the rear
reminder. Each service gets its own reminder stream.

**The app never writes to `reminders`.**
Two places creating reminders means two places to keep in step. Everything goes through
`upsert_reminder_for_line`. When the vehicle-swap feature needed to recreate reminders, a
second copy of the logic was drafted, found to silently drop the service-default case, and
replaced by extracting the shared function both triggers now call.

**Next-due is entered per job line, prefilled from the service.**
`services.reminder_km` and `reminder_months` are hints, not rules. The person who saw the
car decides when it comes back — a taxi and a weekend car with the same oil change are not
due at the same time.

**The oil interval belongs to the grade, and the date to the car's usage.**
One pair per service prefilled 5,000 km / 6 months into every oil change, so full
synthetic customers were called back at half the interval the oil is rated for. Migration
24 put `reminder_km` / `reminder_months` on the `oil_grade` lookup rows and `km_per_day`
on the vehicle; a line's date becomes whichever of the two limits arrives first. This
changes the starting point, not who decides — it is still a prefill, still overwritable,
and still only written into fields nobody has typed in. `km_per_day` is optional
throughout: without it the months cap stands alone and the reminder is less precise,
never wrong.

**Two-way sync between line and reminder.**
The value lives in two places, so a trigger keeps them in step in both directions, guarded
by `pg_trigger_depth()`. This means adjusting a reminder rewrites what the job line says
was decided at that visit. Accepted deliberately: it is one number, not two.

**Overdue reminders never expire.**
They stay pending until sent, dismissed, or superseded by new work.

**Mutes have three levels.**
`whatsapp_opt_in` is consent to be contacted at all. A per-service mute is a preference
about one kind of message. Cancelling one reminder is neither. A blanket mute and a
per-service mute can coexist — the per-service one survives if the blanket is lifted.

**A separate `reminder_sends` log rather than a `failed` status.**
"Tried three times, all failed" is what tells you a number is dead. One status field
cannot hold that.

---

## Money

**Totals are never stored.** Computed in `v_job_totals`. A stored total drifts from its
lines the first time someone edits one.

**Three price fields per line — parts, labour, sub.**
Subcontractor cost is the only cost known exactly at the time of the job; own labour is a
guess from salary. Merging them would lose the ability to evaluate a subcontractor.

**Margin is excluded from Stats.**
`labor_cost` is `est_minutes × shop_hourly_rate` — an estimate on top of estimates I
invented for 347 services. Revenue is real. Margin waits for recorded costs.

---

## Vehicles

**Make is a soft lookup, not a foreign key.**
Chinese brands enter Jordan faster than any seed list survives. A hard constraint would
block a job mid-entry. The list plus one-click add gives consistency without the wall.

**Model is free text with typeahead, not a list.**
Thousands of values, changes yearly, rarely grouped by. `v_vehicle_models` builds itself
from what has been entered.

**Odometer: the entered reading wins unless a later-dated job has one.**
The original rule only ever raised the reading, which made a mistyped 1,000,000 permanent
and uncorrectable. A manual edit on the vehicle always wins — the person is looking at the
dashboard. `odometer_looks_wrong()` warns but never blocks; a lower reading is legitimate
after a cluster replacement.

**Changing a job's vehicle moves its reminders.**
The old vehicle's odometer is deliberately *not* rolled back — it may have been typed by
hand at creation, and recomputing from jobs would destroy that silently. The UI shows both
readings and what the old one would be without the job.

---

## Services

**Fluid and tire fields are declared on the service, not hardcoded.**
`fluid_unit`, `fluid_type_list`, `fluid_grade_list`, `tracks_tires`. Adding a differential
oil change next month means ticking a box, not changing the app.

**Variants are fields, not services.**
AC recharge by refrigerant, battery replacement by chemistry, catalytic converter by
position — one service each, the variant recorded on the line. The workbook had eleven
"Service Light Reset – X" entries; they became one.

**Alignment and balancing stay under Tires, not Steering & Suspension.**
Mechanically they are suspension work. But in the imported data every alignment sits on a
tire-fitting job, the customer thinks of it as a tire job, and categories exist to make
the picker fast. Revisit if standalone alignment work starts appearing.

**Deactivate rather than delete.** A used service cannot be deleted — four foreign keys
point at it. Delete is offered only when all four counts are zero.

---

## Bilingual

**The schema was bilingual from day one**, which made retrofitting the UI cheap. Every
user-facing data field has an `_en` / `_ar` pair.

**Three field patterns, never confused:** bilingual pairs get translated; canonical Latin
identifiers get normalised; free prose is left alone. Storing كامري alongside "Camry"
would split the typeahead exactly as "Range Rover" as a make split the fleet counts.

**Search-time transliteration was rejected.**
محمد is Mohammad, Mohammed, Muhammad. Arabic omits short vowels, so the mapping is
one-to-many both ways. A search that silently fails causes duplicate customers. Instead:
search both columns always, lean on phone numbers, and transliterate at entry with human
confirmation.

**Service names translate on submit, unreviewed.**
An earlier rule said never write a translation silently. That was correct while the
function was untested; once both directions verified correctly, a confirmation step on
every service became friction for nothing. The edit path is the safety net, and the
Services header counts services missing an Arabic name.

**Numbers stay Latin, dates stay ISO.** Arabic-Indic numerals break monospace alignment
and are not what a Jordanian shop puts on an invoice.

**`dir="auto"` alone was not enough.** Verified against a real UAX#9 implementation: a
plate next to Arabic text has its halves swapped. Bare figures need
`unicode-bidi: isolate`; sentences containing figures must not, or the unit detaches from
its number. Hence two classes, `.num` and `.figures`.

---

## Proposals that were withdrawn

**A trigger to move reminders on vehicle change** (first attempt) — dropped the
service-default case and duplicated logic that would drift. Replaced by extracting the
shared function.

**`coalesce(whatsapp_phone, phone)`** — papered over two columns holding one fact and made
the stale one win. The column was dropped instead.

**A slug backfill for `services.code`** — the collision handling would have suffixed the
*existing* seeded service as well as the new one, silently breaking every migration that
referenced `code = 'oil_change'`. Not run. `v_fluid_brands` was rekeyed to `service_id`
instead, which removed the dependency entirely.

**A `default_details()` coercion trigger** — `null` and `{}` mean the same thing for that
column, so the sender was wrong, not the schema. A trigger would have swallowed the same
class of bug elsewhere. The real cause turned out to be PostgREST filling NULL into rows
with non-uniform key sets.

**Blocking a per-service mute when a blanket mute exists** — argued it was a no-op leaving
hidden state. Wrong on both counts: it persists usefully if the blanket is lifted, and the
mutes list displays both. Claude Code's original design was better.

**A dual-axis revenue chart** — specified, built, and flagged by Claude Code as the single
most common charting mistake. Split into two stacked charts sharing an x-axis.
