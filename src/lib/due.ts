import { addDays, addMonths } from './date'
import { parseOptionalInteger } from './parse'

type Remindable = {
  triggers_reminder: boolean
  reminder_km: number | null
  reminder_months: number | null
}

/**
 * Which of a line's two next-due fields the app may still write into.
 *
 * The same distinction the name fields make: what the app put there is an
 * offer and can be replaced by a better offer, what a person typed is the
 * decision and is never overwritten. An empty untouched field counts as the
 * app's — there is nothing there to lose.
 */
export type DueMark = { km: boolean; date: boolean }

/** A line nobody has typed a next-due into yet. */
export const UNTOUCHED_DUE: DueMark = { km: true, date: true }

/**
 * A line already saved. Whatever it says was decided at that visit — prefilled
 * and accepted is still decided, exactly as a saved name carries no mark.
 */
export const DECIDED_DUE: DueMark = { km: false, date: false }

/**
 * Default due point for a job line: the reading at the time of the job plus the
 * service's usual interval. Blank where there is nothing to compute from —
 * blank on both means the trigger creates no reminder.
 *
 * Returns the mark alongside the values so every place that changes a line's
 * service resets both together; a new service's prefill is the app's again.
 */
export function dueDefaults(
  service: Remindable | undefined,
  odometer: number | null,
  baseDate: string,
): { nextDueKm: string; nextDueDate: string; dueMark: DueMark } {
  if (!service?.triggers_reminder) {
    return { nextDueKm: '', nextDueDate: '', dueMark: UNTOUCHED_DUE }
  }

  return {
    nextDueKm:
      odometer !== null && service.reminder_km !== null
        ? String(odometer + service.reminder_km)
        : '',
    nextDueDate:
      service.reminder_months !== null
        ? addMonths(baseDate, service.reminder_months)
        : '',
    dueMark: UNTOUCHED_DUE,
  }
}

/** The interval a lookup value carries. Only the oil grades have one. */
export type GradeInterval = {
  reminder_km: number | null
  reminder_months: number | null
}

/** What settled the date, so the hint can say why rather than just what. */
export type DueDateSource = 'usage' | 'months' | 'none'

/**
 * Where the distance the date is measured over came from.
 *
 * 'backwards' is a next-due reading at or below the one the car came in on.
 * There is no future distance in that, so it produces no date rather than a
 * date already gone.
 */
export type DueDistanceSource = 'grade' | 'entered' | 'backwards'

export type GradeDue = {
  nextDueKm: string
  nextDueDate: string
  /** The distance the date was measured over. Null when there was none to use. */
  distance: number | null
  distanceFrom: DueDistanceSource
  /** How long that distance takes at this car's rate. Null without one. */
  days: number | null
  dateFrom: DueDateSource
}

/**
 * The next-due prefill an oil grade implies, for this car and this visit.
 *
 * Distance is the real limit and months are the cap on oil that degrades
 * sitting still, so the date is whichever of the two arrives first. Turning
 * the distance into a date needs the car's daily average; without one the cap
 * stands alone and the reminder is simply less precise. That is why km_per_day
 * is optional and why nothing here treats its absence as an error.
 *
 * The distance is the one the next-due reading implies, not the grade's
 * default. A hand-set reading is a decision about how far this car goes before
 * it comes back, and measuring the date over the grade's 10,000 while the
 * field beside it says 12,000 puts two contradictory answers on one line.
 * While that field is still the app's it holds odometer + the grade's
 * distance, so the two agree and the ordinary case is unchanged.
 *
 * Null when there is no interval to work from — a grade list other than
 * oil_grade carries nulls, and computing from those would produce a date out
 * of nothing.
 */
export type DueInputs = {
  service: Remindable | undefined
  interval: GradeInterval | null | undefined
  odometer: number | null
  kmPerDay: number | null
  baseDate: string
  /** The next-due reading as it stands, and whether it is the app's or a person's. */
  line: { nextDueKm: string; dueMark: DueMark }
}

export function gradeDue({
  service,
  interval,
  odometer,
  kmPerDay,
  baseDate,
  line,
}: DueInputs): GradeDue | null {
  // A line whose service does not trigger a reminder has no next-due fields on
  // screen; filling them would store a due point nobody can see.
  if (!service?.triggers_reminder) return null
  if (!interval) return null

  const intervalKm = interval.reminder_km
  const months = interval.reminder_months
  if (intervalKm === null && months === null) return null

  // Only a reading somebody put there is consulted. While the mark stands the
  // field is about to be rewritten to odometer + the grade's distance anyway,
  // and reading the value it is replacing would measure the date over the
  // grade the line just moved away from.
  const entered = line.dueMark.km ? null : parseOptionalInteger(line.nextDueKm)
  const spread =
    entered !== null && entered !== 'invalid' && odometer !== null
      ? entered - odometer
      : null

  // A next-due at or below the reading the car came in on. Falling back to the
  // grade's default here would quietly paper over what is almost always a
  // typo — the odometer hint beside the field is already flagging it — so the
  // distance is dropped and the months cap stands alone.
  const distanceFrom: DueDistanceSource =
    spread === null ? 'grade' : spread > 0 ? 'entered' : 'backwards'
  const distance =
    distanceFrom === 'entered' ? spread : distanceFrom === 'grade' ? intervalKm : null

  const byMonths = months === null ? null : addMonths(baseDate, months)

  // Ceiling, not rounding: the oil is not due until the distance is actually
  // covered, and a distance shorter than one day's driving still takes a day.
  const days =
    distance !== null && kmPerDay !== null && kmPerDay > 0
      ? Math.ceil(distance / kmPerDay)
      : null
  const byUsage = days === null ? null : addDays(baseDate, days)

  // ISO dates sort as text, so "whichever comes first" is a string compare.
  // A tie is credited to the cap: it is the limit that would have applied
  // anyway, and it is the one that holds if the average is a little off.
  const sooner =
    byUsage !== null && byMonths !== null
      ? byUsage < byMonths
        ? { date: byUsage, from: 'usage' as const }
        : { date: byMonths, from: 'months' as const }
      : byUsage !== null
        ? { date: byUsage, from: 'usage' as const }
        : byMonths !== null
          ? { date: byMonths, from: 'months' as const }
          : { date: '', from: 'none' as const }

  return {
    nextDueKm:
      odometer !== null && intervalKm !== null ? String(odometer + intervalKm) : '',
    nextDueDate: sooner.date,
    distance,
    distanceFrom,
    days,
    dateFrom: sooner.from,
  }
}

/** What a recomputation offers to change about a line's next-due pair. */
export type DuePatch = { nextDueKm?: string; nextDueDate?: string }

/**
 * The patch a grade change makes to a line's next-due fields.
 *
 * Only fields the app still owns are rewritten. Once someone has typed a
 * next-due, that is what the person who saw the car decided, and a better
 * starting point is not a reason to throw it away.
 *
 * A blank result never overwrites a value: switching to a grade that carries
 * no interval, or to one whose distance cannot be turned into a reading
 * because the job has no odometer, leaves what is already there. Not firing
 * is the correct behaviour, not clearing.
 */
export function regradeDue(line: { dueMark: DueMark }, due: GradeDue | null): DuePatch {
  if (due === null) return {}

  return {
    ...(line.dueMark.km && due.nextDueKm !== '' ? { nextDueKm: due.nextDueKm } : {}),
    ...(line.dueMark.date && due.nextDueDate !== ''
      ? { nextDueDate: due.nextDueDate }
      : {}),
  }
}

/**
 * The patch a line needs when the car under it has changed.
 *
 * Not a regrade. A regrade answers "this grade lasts longer than the last
 * one"; this answers "everything these two numbers were measured against has
 * been replaced" — a different reading, a different daily average, a different
 * vehicle for the reminder to be keyed on.
 *
 * Two differences follow from that. It falls back to the service's own
 * interval where the grade carries none, so a brake fluid line is re-derived
 * along with the oil rather than left measured against a car no longer on the
 * job. And a blank result is written rather than skipped: where a regrade's
 * blank means "this grade says nothing", a re-derive's means "there is no
 * reading to measure from now", which is a fact about the new car and worth
 * more than a figure belonging to the old one.
 *
 * Marked fields only, as ever. A typed next-due is a decision about how far
 * this car goes before it comes back, and it survives the swap.
 */
export function rederivedDue(inputs: DueInputs): DuePatch {
  const fresh =
    gradeDue(inputs) ?? dueDefaults(inputs.service, inputs.odometer, inputs.baseDate)

  return {
    ...(inputs.line.dueMark.km ? { nextDueKm: fresh.nextDueKm } : {}),
    ...(inputs.line.dueMark.date ? { nextDueDate: fresh.nextDueDate } : {}),
  }
}

/**
 * Applies a patch to a line. A patch that changes nothing returns the line
 * itself, identity and all — most of a job's lines are in that position when
 * one shared figure moves, and handing React a new object for each of them
 * would re-render the lot.
 */
export function withDue<T extends { nextDueKm: string; nextDueDate: string }>(
  line: T,
  patch: DuePatch,
): T {
  const moved =
    (patch.nextDueKm !== undefined && patch.nextDueKm !== line.nextDueKm) ||
    (patch.nextDueDate !== undefined && patch.nextDueDate !== line.nextDueDate)

  return moved ? { ...line, ...patch } : line
}
