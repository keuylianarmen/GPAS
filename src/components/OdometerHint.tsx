import { km } from '../lib/format'
import { parseOptionalInteger } from '../lib/parse'

export type OdometerReference =
  | { value: number; source: 'job' | 'vehicle' }
  | null

/**
 * The reading a next-due distance is measured against, plus the gap once one is
 * typed. A next-due at or below the current reading is already past, so it is
 * called out rather than shown as an ordinary difference.
 */
export default function OdometerHint({
  reference,
  entered,
}: {
  reference: OdometerReference
  entered: string
}) {
  if (reference === null) {
    return (
      <span className="odo-hint">
        No odometer reading on this job or its vehicle.
      </span>
    )
  }

  const parsed = parseOptionalInteger(entered)
  const gap = typeof parsed === 'number' ? parsed - reference.value : null

  return (
    <span className="odo-hint">
      Now at <span className="num">{km(reference.value)} km</span>{' '}
      {reference.source === 'job' ? 'on this job' : 'on the vehicle'}
      {gap !== null && (
        <span className={gap > 0 ? 'odo-gap' : 'odo-gap odo-gap--warn'}>
          {' · '}
          {gap > 0 ? '+' : gap < 0 ? '−' : '±'}
          <span className="num">{km(Math.abs(gap))} km</span>
        </span>
      )}
    </span>
  )
}
