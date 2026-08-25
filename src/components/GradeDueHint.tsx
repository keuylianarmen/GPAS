import { km } from '../lib/format'
import type { GradeDue } from '../lib/due'
import { t, tn } from '../lib/i18n'
import KmPerDayField from './KmPerDayField'

/**
 * Why the next-due fields on this line say what they say.
 *
 * One block under the pair, never a dialog. The numbers are a starting point
 * and the person who saw the car still decides, so the explanation has to be
 * cheap to read past — and it has to name the grade, because the grade is the
 * thing the reader can change if the answer looks wrong.
 *
 * Three parts, each on its own terms:
 *
 * - What the grade is rated for. Always, while a grade with an interval is on
 *   the line.
 * - Which of its two limits produced the date — but only while that date is
 *   the one in the box. Once someone types over it the sentence would be
 *   describing a value that is not there.
 * - What the computation would give, offered with a button, when the box says
 *   something else. Overriding a prefill should not be a one-way door.
 *
 * Below them, the one input that would sharpen all of it. The daily average is
 * a fact about the car, not about this line's date, so it stays put whatever
 * the date says — including after the date has been overridden, where changing
 * it moves the offer instead of the field.
 */
export default function GradeDueHint({
  grade,
  intervalKm,
  intervalMonths,
  kmPerDay,
  due,
  enteredDate,
  onUseComputed,
  onSaveKmPerDay,
  disabled = false,
}: {
  /** The grade's label in the reading language. */
  grade: string
  intervalKm: number | null
  intervalMonths: number | null
  kmPerDay: number | null
  due: GradeDue
  /** What the next-due date field is holding right now. */
  enteredDate: string
  /**
   * Puts the computed date back in the field and hands the field back to the
   * app. Null where an offer would be unwelcome — a saved line whose date
   * nobody has touched this session was decided at that visit.
   */
  onUseComputed: (() => void) | null
  /**
   * Persists a daily average against the car. Null when there is nothing to
   * write it to — a job with no vehicle linked, where the question has no
   * subject and the field is not offered.
   */
  onSaveKmPerDay: ((kmPerDay: number) => Promise<string | null>) | null
  disabled?: boolean
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

  // Whether the sentence about the date is still true of the field. Compared
  // by value rather than by the suggested mark: someone who typed the same
  // date by hand wants the explanation, not an offer of what is already there.
  const standing = due.nextDueDate !== '' && due.nextDueDate === enteredDate
  // Nothing computed means nothing to contradict, and the reason clause says
  // exactly that.
  const explains = standing || due.nextDueDate === ''

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

  /** The offer names the limit that produced the date, not just the date. */
  function offer(): string {
    if (due.dateFrom === 'usage' && kmPerDay !== null) {
      return t('gradeDue.offerUsage', { perDay: km(kmPerDay), date: due.nextDueDate })
    }
    // The cap produced it, so there is a months figure by construction.
    return t('gradeDue.offerMonths', { months: months ?? '', date: due.nextDueDate })
  }

  return (
    <div className="due-explain">
      {/* A sentence carrying figures, not a bare figure: .figures with dir
          auto, so each unit stays attached to its number in Arabic. */}
      <p className="due-hint figures" dir="auto">
        {explains ? `${rated} ${reason()}` : rated}
      </p>

      {!explains && onUseComputed && (
        <div className="due-offer">
          <span className="figures" dir="auto">
            {offer()}
          </span>
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={onUseComputed}
            disabled={disabled}
          >
            {t('gradeDue.useComputed')}
          </button>
        </div>
      )}

      {onSaveKmPerDay && (
        <KmPerDayField value={kmPerDay} onSave={onSaveKmPerDay} disabled={disabled} />
      )}
    </div>
  )
}
