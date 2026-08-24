import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { useLookup } from '../lib/useLookup'
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
  const [nameEn, setNameEn] = useState(customer.name_en ?? '')
  const [nameAr, setNameAr] = useState(customer.name_ar ?? '')
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
      nameEn: nameEn.trim(),
      nameAr: nameAr.trim(),
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

    onSaved(data)
  }

  return (
    <Dialog title={t('customerForm.editTitle')} onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>
            {t('customerForm.nameEn')}{' '}
            <span className="field-hint">{t('customerForm.nameEnHint')}</span>
          </span>
          <input
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            disabled={saving}
            autoFocus
          />
        </label>

        <label className="field">
          <span>
            {t('customerForm.nameAr')}{' '}
            <span className="field-hint">{t('customerForm.nameArHint')}</span>
          </span>
          <input
            dir="auto"
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
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
