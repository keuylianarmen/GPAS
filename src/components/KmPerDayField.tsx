import { useState } from 'react'
import { parseOptionalPositiveInteger } from '../lib/parse'
import { t } from '../lib/i18n'

/**
 * The car's daily average, asked for at the point it is needed.
 *
 * The question belongs to the counter — someone is standing there with the
 * customer, entering an oil change, and "how far do you drive?" is a thing you
 * ask then, not a thing you go and edit on a vehicle form afterwards. So the
 * field is offered inside the hint that explains the date it changes.
 *
 * What it writes is still the vehicle's, not the line's: the same figure moves
 * every oil line on this job and every job after it. The label says so rather
 * than leaving the reader to find out.
 */
export default function KmPerDayField({
  value,
  onSave,
  disabled = false,
}: {
  value: number | null
  /** Persists the figure. Resolves to a message to show, or null on success. */
  onSave: (kmPerDay: number) => Promise<string | null>
  disabled?: boolean
}) {
  const stored = value === null ? '' : String(value)
  const [text, setText] = useState(stored)
  const [shown, setShown] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The figure belongs to the vehicle, so it can change from outside this
  // field — a second oil line on the same job renders a second copy, and
  // answering on one has to show up on the other. Adjusted during render
  // rather than in an effect, so the input never paints a stale figure.
  if (value !== shown) {
    setShown(value)
    setText(stored)
    setError(null)
  }

  async function commit() {
    const typed = text.trim()

    // Cleared rather than corrected. Put back rather than written as null:
    // removing a figure is a deliberate vehicle edit, and the vehicle form is
    // where a field gets emptied. Silently nulling the car's average from a
    // hint is not something anyone asked for.
    if (typed === '') {
      setText(stored)
      setError(null)
      return
    }

    const parsed = parseOptionalPositiveInteger(typed)
    if (parsed === 'invalid' || parsed === null) {
      setError(t('vehicle.badKmPerDay'))
      return
    }
    if (parsed === value) {
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    const failure = await onSave(parsed)
    setSaving(false)
    // A refused write leaves the typed figure exactly where it is and leaves
    // the line alone. The next blur tries again.
    setError(failure)
  }

  return (
    <div className="due-usage">
      <label className="field due-usage-field">
        <span>
          {t(value === null ? 'vehicleForm.kmPerDay' : 'gradeDue.usageLabel')}{' '}
          <span className="field-hint">{t('gradeDue.usageOnCar')}</span>
        </span>
        <input
          className="num"
          inputMode="numeric"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            // Nothing around this is a form today. Guarded anyway: a line
            // editor that grows one later must not save the job on Enter.
            event.preventDefault()
            event.currentTarget.blur()
          }}
          placeholder={t('vehicleForm.kmPerDayPlaceholder')}
          disabled={disabled || saving}
          aria-busy={saving}
        />
      </label>
      {saving && <span className="due-usage-state">{t('action.saving')}</span>}
      {error && (
        <span className="due-usage-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
