import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { invalidateSubcontractors } from '../lib/useSubcontractors'
import { useNamePair } from '../lib/useNamePair'
import NamePairFields from './NamePairFields'
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
  // One press spent asking for the other name. Only ever unblocks: once set,
  // every later press saves, whatever the request did or did not return.
  const [nudged, setNudged] = useState(false)

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

    // One name filled and one empty is usually someone about to get the
    // second for free. Spend the first press fetching it rather than saving
    // half a pair — then get out of the way permanently.
    if (!name !== !nameAr && !nudged) {
      setNudged(true)
      // The empty field's placeholder becomes "Finding the…", which is what
      // says why nothing saved. Not started if one is already on its way.
      if (names.pending === null) {
        if (name) names.onBlurEn()
        else names.onBlurAr()
      }
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

  return (
    <Dialog title={t('sub.title')} onClose={onClose} busy={saving}>
      <NamePairFields
        names={names}
        disabled={saving}
        onEnterKey={save}
        labels={{
          labelEn: 'sub.nameEn',
          labelAr: 'sub.nameAr',
          hintEn: 'sub.nameHint',
          hintAr: 'sub.nameHint',
          placeholderEn: 'sub.placeholderEn',
          placeholderAr: 'sub.placeholderAr',
          findingEn: 'sub.findingEn',
          findingAr: 'sub.findingAr',
        }}
      />

      <p className="field-note">{t('sub.note')}</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className={
          nudged && !saving ? 'btn btn--dark btn--full btn--nudge' : 'btn btn--dark btn--full'
        }
        onClick={save}
        disabled={saving}
      >
        {saving ? t('sub.saving') : t('sub.save')}
      </button>
    </Dialog>
  )
}
