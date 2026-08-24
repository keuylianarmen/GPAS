import { km } from '../lib/format'
import { parseOptionalInteger } from '../lib/parse'
import { t } from '../lib/i18n'

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
      <span className="odo-hint">{t('odoHint.none')}</span>
    )
  }

  const parsed = parseOptionalInteger(entered)
  const gap = typeof parsed === 'number' ? parsed - reference.value : null

  return (
    <span className="odo-hint">
      {t('odoHint.nowAt')}{' '}
      <span className="num">
        {km(reference.value)} {t('common.km')}
      </span>{' '}
      {reference.source === 'job' ? t('odoHint.onJob') : t('odoHint.onVehicle')}
      {gap !== null && (
        <span className={gap > 0 ? 'odo-gap' : 'odo-gap odo-gap--warn'}>
          {' · '}
          {gap > 0 ? '+' : gap < 0 ? '−' : '±'}
          <span className="num">
            {km(Math.abs(gap))} {t('common.km')}
          </span>
        </span>
      )}
    </span>
  )
}
