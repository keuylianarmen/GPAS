import type { NamePair } from '../lib/useNamePair'
import type { StringKey } from '../lib/i18n'
import { t, useLocale } from '../lib/i18n'

export type NameFieldLabels = {
  labelEn: StringKey
  labelAr: StringKey
  hintEn: StringKey
  hintAr: StringKey
  placeholderEn: StringKey
  placeholderAr: StringKey
  findingEn: StringKey
  findingAr: StringKey
}

/**
 * The Latin and Arabic halves of a name pair, in the order the reader expects.
 *
 * The reading language leads and takes focus. An English-first form with
 * autofocus is what put Arabic in the Latin box often enough to need the
 * script-routing move in useNamePair; that move stays as the safety net, but
 * this is what stops it firing on the ordinary case.
 *
 * Label keys are passed rather than derived, so a form with its own wording
 * keeps it and StringKey still checks every one at compile time.
 */
export default function NamePairFields({
  names,
  labels,
  disabled = false,
  onEnterKey,
}: {
  names: NamePair
  labels: NameFieldLabels
  disabled?: boolean
  /** These dialogs open inside another form, so Enter is wired by hand. */
  onEnterKey?: () => void
}) {
  const locale = useLocale()

  function field(side: 'en' | 'ar') {
    const mark = names.markOf(side)
    const isEn = side === 'en'

    return (
      <label className="field" key={side}>
        <span>
          {t(isEn ? labels.labelEn : labels.labelAr)}{' '}
          <span className="field-hint">{t(isEn ? labels.hintEn : labels.hintAr)}</span>
          {mark && (
            <>
              {' '}
              <span className="field-hint">
                {t(mark === 'suggested' ? 'common.suggested' : 'customerForm.movedHere')}
              </span>
            </>
          )}
        </span>
        <input
          className={mark ? `is-${mark}` : undefined}
          // The Latin field is left to the browser: dir="auto" on it would
          // flip the whole box the moment Arabic is typed, and the routing
          // below moves that text out anyway.
          dir={isEn ? undefined : 'auto'}
          value={isEn ? names.en : names.ar}
          onChange={(event) =>
            isEn ? names.setEn(event.target.value) : names.setAr(event.target.value)
          }
          onBlur={isEn ? names.onBlurEn : names.onBlurAr}
          onKeyDown={(event) => {
            if (onEnterKey && event.key === 'Enter') {
              event.preventDefault()
              onEnterKey()
            }
          }}
          // The example name would read as a value while the real one is on
          // its way, so the slot it occupies is where the wait belongs.
          placeholder={
            names.pending === side
              ? t(isEn ? labels.findingEn : labels.findingAr)
              : t(isEn ? labels.placeholderEn : labels.placeholderAr)
          }
          aria-busy={names.pending === side}
          disabled={disabled}
          // DOM order is tab order, so the leading field is also the first
          // one tabbed to — no tabindex needed to keep the two in step.
          autoFocus={locale === 'ar' ? side === 'ar' : side === 'en'}
        />
      </label>
    )
  }

  return <>{locale === 'ar' ? [field('ar'), field('en')] : [field('en'), field('ar')]}</>
}
