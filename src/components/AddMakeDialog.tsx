import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateLookup } from '../lib/useLookup'
import Dialog from './Dialog'
import { t } from '../lib/i18n'

/** lookup_values.value is the list's own key; the display name is what vehicles store. */
function keyFor(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export default function AddMakeDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  /** Receives label_en — vehicles.make holds the display name. */
  onSaved: (label: string) => void
}) {
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = label.trim()
    if (!trimmed) {
      setError(t('make.needName'))
      return
    }

    const key = keyFor(trimmed)
    if (!key) {
      setError(t('make.needLatin'))
      return
    }

    setError(null)
    setSaving(true)

    const { error: insertError } = await supabase.from('lookup_values').insert({
      list_key: 'vehicle_make',
      value: key,
      label_en: trimmed,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    await invalidateLookup('vehicle_make')
    onSaved(trimmed)
  }

  // No <form>: this dialog opens from inside the customer form, and a nested
  // form would be invalid. Enter is wired up by hand instead.
  return (
    <Dialog title={t('make.title')} onClose={onClose} busy={saving}>
      <label className="field">
        <span>{t('make.label')}</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!saving) save()
            }
          }}
          placeholder={t('make.placeholder')}
          disabled={saving}
          autoFocus
        />
      </label>

      <p className="field-note">{t('make.note')}</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn--dark btn--full"
        onClick={save}
        disabled={saving}
      >
        {saving ? t('make.saving') : t('make.save')}
      </button>
    </Dialog>
  )
}
