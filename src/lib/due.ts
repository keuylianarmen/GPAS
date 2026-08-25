import { addDays, addMonths } from './date'

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

export type GradeDue = {
  nextDueKm: string
  nextDueDate: string
  /** How long the grade's distance takes at this car's rate. Null without one. */
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
 * Null when there is no interval to work from — a grade list other than
 * oil_grade carries nulls, and computing from those would produce a date out
 * of nothing.
 */
export function gradeDue(
  service: Remindable | undefined,
  interval: GradeInterval | null | undefined,
  odometer: number | null,
  kmPerDay: number | null,
  baseDate: string,
): GradeDue | null {
  // A line whose service does not trigger a reminder has no next-due fields on
  // screen; filling them would store a due point nobody can see.
  if (!service?.triggers_reminder) return null
  if (!interval) return null

  const intervalKm = interval.reminder_km
  const months = interval.reminder_months
  if (intervalKm === null && months === null) return null

  const byMonths = months === null ? null : addMonths(baseDate, months)

  const days =
    intervalKm !== null && kmPerDay !== null && kmPerDay > 0
      ? Math.round(intervalKm / kmPerDay)
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
    days,
    dateFrom: sooner.from,
  }
}

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
export function regradeDue(
  line: { dueMark: DueMark },
  due: GradeDue | null,
): { nextDueKm?: string; nextDueDate?: string } {
  if (due === null) return {}

  return {
    ...(line.dueMark.km && due.nextDueKm !== '' ? { nextDueKm: due.nextDueKm } : {}),
    ...(line.dueMark.date && due.nextDueDate !== ''
      ? { nextDueDate: due.nextDueDate }
      : {}),
  }
}
