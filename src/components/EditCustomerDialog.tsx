import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { useLookup } from '../lib/useLookup'
import { useCustomerNames } from '../lib/useCustomerNames'
import Dialog from './Dialog'
import { t } from '../lib/i18n'
import LookupSelect from './LookupSelect'

type Customer = Database['public']['Tables']['customers']['Row']

export default function EditCustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer
  onClose: () => void
  onSaved: (customer: Customer) => void
}) {
  // Both names already on file means someone wrote them. Suggesting over a
  // hand correction — clear one half, tab out, watch it come back — would
  // undo the edit that was the point of opening this dialog.
  const names = useCustomerNames({
    initialEn: customer.name_en ?? '',
    initialAr: customer.name_ar ?? '',
    suggest: !(customer.name_en?.trim() && customer.name_ar?.trim()),
  })
  // Both marks are mutually exclusive per field: one holds what the user
  // typed, the other holds what the app suggested.
  const enMark = names.markOf('en')
  const arMark = names.markOf('ar')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [optIn, setOptIn] = useState(customer.whatsapp_opt_in)
  const [isPeriodic, setIsPeriodic] = useState(customer.is_periodic)
  const [source, setSource] = useState(customer.source ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const sources = useLookup('customer_source')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = {
      nameEn: names.en.trim(),
      nameAr: names.ar.trim(),
      phone: phone.trim(),
    }

    // customer_identifiable still applies on update, not just on insert.
    if (!trimmed.nameEn && !trimmed.nameAr && !trimmed.phone) {
      setError(t('customerForm.needIdentity'))
      return
    }

    setError(null)
    setSaving(true)

    const { data, error: updateError } = await supabase
      .from('customers')
      .update({
        name_en: trimmed.nameEn || null,
        name_ar: trimmed.nameAr || null,
        phone: trimmed.phone || null,
        whatsapp_opt_in: optIn,
        is_periodic: isPeriodic,
        source: source.trim() || null,
        notes: notes.trim() || null,
      })
      .eq('id', customer.id)
      .select()
      .single()

    if (updateError || !data) {
      setError(updateError?.message ?? t('customerForm.changesFailed'))
      setSaving(false)
      return
    }

    names.accept()
    onSaved(data)
  }

  return (
    <Dialog title={t('customerForm.editTitle')} onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>
            {t('customerForm.nameEn')}{' '}
            <span className="field-hint">{t('customerForm.nameEnHint')}</span>
            {enMark && (
              <> <span className="field-hint">
                {t(enMark === 'suggested' ? 'common.suggested' : 'customerForm.movedHere')}
              </span></>
            )}
          </span>
          <input
            className={enMark ? `is-${enMark}` : undefined}
            autoFocus
            value={names.en}
            onChange={(event) => names.setEn(event.target.value)}
            onBlur={names.onBlurEn}
            // The example name would read as a value while the real one is on
            // its way, so the slot it occupies is where the wait belongs.
            placeholder={
              names.pending === 'en'
                ? t('customerForm.findingEn')
                : t('customerForm.nameEnPlaceholder')
            }
            aria-busy={names.pending === 'en'}
            disabled={saving}
          />
        </label>

        <label className="field">
          <span>
            {t('customerForm.nameAr')}{' '}
            <span className="field-hint">{t('customerForm.nameArHint')}</span>
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
            // The example name would read as a value while the real one is on
            // its way, so the slot it occupies is where the wait belongs.
            placeholder={
              names.pending === 'ar'
                ? t('customerForm.findingAr')
                : t('customerForm.nameArPlaceholder')
            }
            aria-busy={names.pending === 'ar'}
            disabled={saving}
          />
        </label>

        <label className="field">
          <span>{t('customerForm.phone')}</span>
          <input
            className="num"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('customerForm.phonePlaceholder')}
            disabled={saving}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(event) => setOptIn(event.target.checked)}
            disabled={saving}
          />
          {t('customerForm.optIn')}
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={isPeriodic}
            onChange={(event) => setIsPeriodic(event.target.checked)}
            disabled={saving}
          />
          {t('customerForm.periodic')}
        </label>

        <label className="field">
          <span>
            {t('customerForm.source')}{' '}
            <span className="field-hint">{t('customerForm.sourceHint')}</span>
          </span>
          <LookupSelect
            value={source}
            options={sources}
            onChange={setSource}
            disabled={saving}
          />
        </label>

        <label className="field">
          <span>{t('customerForm.notes')}</span>
          <textarea
            rows={3}
            dir="auto"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={saving}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving ? t('action.saving') : t('action.saveChanges')}
        </button>
      </form>
    </Dialog>
  )
}
