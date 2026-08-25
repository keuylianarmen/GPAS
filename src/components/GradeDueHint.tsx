import { km } from '../lib/format'
import type { GradeDue } from '../lib/due'
import { t, tn } from '../lib/i18n'

/**
 * Why the next-due fields on this line say what they say.
 *
 * One line under the pair, never a dialog. The numbers are a starting point
 * and the person who saw the car still decides, so the explanation has to be
 * cheap to read past — and it has to name the grade, because the grade is the
 * thing the reader can change if the answer looks wrong.
 *
 * Two clauses: what the grade is rated for, then which of its two limits
 * produced the date. The distance the app wrote is left to the odometer hint
 * under the km field, which already shows the gap.
 */
export default function GradeDueHint({
  grade,
  intervalKm,
  intervalMonths,
  kmPerDay,
  due,
}: {
  /** The grade's label in the reading language. */
  grade: string
  intervalKm: number | null
  intervalMonths: number | null
  kmPerDay: number | null
  due: GradeDue
}) {
  // Both counts go through plural rules: Arabic needs two, few and many for
  // figures English treats identically. The day count is handed to tn twice —
  // the raw number picks the plural form, the grouped string is what renders,
  // because a low daily average puts four digits in there.
  const months = intervalMonths === null ? null : tn(intervalMonths, 'gradeDue.months')
  const days =
    due.days === null ? null : tn(due.days, 'gradeDue.days', { count: km(due.days) })

  const rated =
    intervalKm !== null && months !== null
      ? t('gradeDue.interval', { grade, km: km(intervalKm), months })
      : intervalKm !== null
        ? t('gradeDue.intervalKm', { grade, km: km(intervalKm) })
        : t('gradeDue.intervalMonths', { grade, months: months ?? '' })

  function reason(): string {
    if (due.nextDueDate === '') return t('gradeDue.noDate')

    if (due.dateFrom === 'usage' && days !== null && kmPerDay !== null) {
      return t('gradeDue.byUsage', {
        perDay: km(kmPerDay),
        days,
        date: due.nextDueDate,
      })
    }

    if (months === null) return t('gradeDue.due', { date: due.nextDueDate })

    // The cap won. How long the distance would have taken is what tells
    // someone the average on the vehicle is wrong, so it is worth naming.
    // Neither clause repeats the months figure — the first sentence just
    // said it, two words earlier.
    if (days !== null && kmPerDay !== null) {
      return t('gradeDue.byMonths', {
        perDay: km(kmPerDay),
        days,
        date: due.nextDueDate,
      })
    }

    return t('gradeDue.noUsage', { date: due.nextDueDate })
  }

  return (
    // A sentence carrying figures, not a bare figure: .figures with dir auto,
    // so each unit stays attached to its number in Arabic.
    <p className="due-hint figures" dir="auto">
      {rated} {reason()}
    </p>
  )
}
