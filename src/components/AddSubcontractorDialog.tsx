import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateSubcontractors } from '../lib/useSubcontractors'
import { useNamePair } from '../lib/useNamePair'
import Dialog from './Dialog'
import { t } from '../lib/i18n'

/**
 * Adds a subcontractor from inside the job line, the way AddMakeDialog adds a
 * make — the moment you need one is the moment you are entering the work.
 *
 * Two names, because Pattern 1 applies: these are people and firms with Arabic
 * names and the Latin form is a transliteration of the original, exactly as
 * with a customer. Same hook, so the blur suggestion, the marks and the
 * misplaced-script handling behave identically to the customer form.
 *
 * `type` was NOT NULL until migration 22 and is now nullable, so the form does
 * not have to ask for a classifier nothing in the app knows the values for.
 */
export default function AddSubcontractorDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  /** Receives the new row's id, so the line can select it immediately. */
  onSaved: (id: string) => void
}) {
  // Nothing is typed yet, so a suggestion can never sit on a correction.
  const names = useNamePair({ suggest: true })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const enMark = names.markOf('en')
  const arMark = names.markOf('ar')

  async function save() {
    const name = names.en.trim()
    const nameAr = names.ar.trim()

    // At least one, like the customer form. `name` is NOT NULL, so an
    // Arabic-only entry has to carry the Arabic in both columns rather than
    // being rejected — the picker orders by `name` and cannot hold a gap.
    if (!name && !nameAr) {
      setError(t('sub.needName'))
      return
    }

    setError(null)
    setSaving(true)

    const { data, error: insertError } = await supabase
      .from('subcontractors')
      .insert({ name: name || nameAr, name_ar: nameAr || null, active: true })
      .select('id')
      .single()

    if (insertError || !data) {
      // Every staff member can insert here, so this is a genuine failure
      // rather than a permission wall the button should not have offered.
      setError(insertError?.message ?? t('sub.saveFailed'))
      setSaving(false)
      return
    }

    names.accept()
    await invalidateSubcontractors()
    onSaved(data.id)
  }

  // No <form>: this opens from inside the job form, and a nested form would be
  // invalid. Enter is wired by hand instead.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!saving) save()
    }
  }

  return (
    <Dialog title={t('sub.title')} onClose={onClose} busy={saving}>
      <label className="field">
        <span>
          {t('sub.nameEn')}{' '}
          <span className="field-hint">{t('sub.nameHint')}</span>
          {enMark && (
            <> <span className="field-hint">
              {t(enMark === 'suggested' ? 'common.suggested' : 'customerForm.movedHere')}
            </span></>
          )}
        </span>
        <input
          className={enMark ? `is-${enMark}` : undefined}
          value={names.en}
          onChange={(event) => names.setEn(event.target.value)}
          onBlur={names.onBlurEn}
          onKeyDown={onKeyDown}
          placeholder={
            names.pending === 'en' ? t('sub.findingEn') : t('sub.placeholderEn')
          }
          aria-busy={names.pending === 'en'}
          disabled={saving}
          autoFocus
        />
      </label>

      <label className="field">
        <span>
          {t('sub.nameAr')}{' '}
          <span className="field-hint">{t('sub.nameHint')}</span>
          {arMark && (
            <> <span className="field-hint">
              {t(arMark === 'suggested' ? 'common.suggested' : 'customerForm.movedHere')}
            </span></>
          )}
        </span>
        <input
          className={arMark ? `is-${arMark}` : undefined}
          dir="auto"
          value={names.ar}
          onChange={(event) => names.setAr(event.target.value)}
          onBlur={names.onBlurAr}
          onKeyDown={onKeyDown}
          placeholder={
            names.pending === 'ar' ? t('sub.findingAr') : t('sub.placeholderAr')
          }
          aria-busy={names.pending === 'ar'}
          disabled={saving}
        />
      </label>

      <p className="field-note">{t('sub.note')}</p>

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
        {saving ? t('sub.saving') : t('sub.save')}
      </button>
    </Dialog>
  )
}
