import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { customerLabel } from '../lib/customer'
import { useCustomerNames } from '../lib/useCustomerNames'
import Dialog from './Dialog'
import { t, tn } from '../lib/i18n'
import VehicleFields from './VehicleFields'
import {
  describeVehicle,
  emptyVehicleDraft,
  isBlankVehicle,
  vehicleInsertFrom,
} from '../lib/vehicle'
import type { VehicleDraft } from '../lib/vehicle'

type Customer = Database['public']['Tables']['customers']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']

export type NewCustomerResult = { customer: Customer; vehicles: Vehicle[] }

export default function AddCustomerDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (result: NewCustomerResult) => void
}) {
  // A new customer has nothing typed yet, so a suggestion can never be
  // sitting on top of someone's own correction here.
  const names = useCustomerNames({ suggest: true })
  // Both marks are mutually exclusive per field: one holds what the user
  // typed, the other holds what the app suggested.
  const enMark = names.markOf('en')
  const arMark = names.markOf('ar')
  const [phone, setPhone] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [drafts, setDrafts] = useState<VehicleDraft[]>([emptyVehicleDraft()])

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Nothing here is transactional, so committed work is remembered and a retry
  // picks up where it failed instead of duplicating rows.
  const [savedCustomer, setSavedCustomer] = useState<Customer | null>(null)
  const [savedVehicles, setSavedVehicles] = useState<Map<number, Vehicle>>(new Map())

  function updateDraft(index: number, next: VehicleDraft) {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? next : draft)),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = {
      nameEn: names.en.trim(),
      nameAr: names.ar.trim(),
      phone: phone.trim(),
    }

    // Mirrors the customer_identifiable check constraint, so the database error
    // never has to reach the user.
    if (!trimmed.nameEn && !trimmed.nameAr && !trimmed.phone) {
      setError(t('customerForm.needIdentity'))
      return
    }

    setError(null)
    setSaving(true)

    let customer = savedCustomer
    if (!customer) {
      const { data, error: customerError } = await supabase
        .from('customers')
        .insert({
          name_en: trimmed.nameEn || null,
          name_ar: trimmed.nameAr || null,
          phone: trimmed.phone || null,
          whatsapp_opt_in: optIn,
        })
        .select()
        .single()

      if (customerError || !data) {
        setError(customerError?.message ?? t('customerForm.saveFailed'))
        setSaving(false)
        return
      }
      customer = data
      setSavedCustomer(data)
      // Saved, so whatever is in the fields is the customer's name now.
      names.accept()
    }

    const saved = new Map(savedVehicles)
    const failures: string[] = []

    for (const [index, draft] of drafts.entries()) {
      if (isBlankVehicle(draft) || saved.has(index)) continue

      const payload = vehicleInsertFrom(draft, customer.id)
      if ('error' in payload) {
        failures.push(`${describeVehicle(draft, index)}: ${payload.error}`)
        continue
      }

      const { data, error: vehicleError } = await supabase
        .from('vehicles')
        .insert(payload)
        .select()
        .single()

      if (vehicleError || !data) {
        failures.push(
          `${describeVehicle(draft, index)}: ${vehicleError?.message ?? 'could not be saved'}`,
        )
        continue
      }
      saved.set(index, data)
    }

    setSavedVehicles(saved)

    if (failures.length > 0) {
      // The customer and any working vehicles are already committed. Say so,
      // rather than implying the whole form failed.
      setError(
        t('customerForm.partialSave', {
          customer: customerLabel(customer),
          failed: tn(failures.length, 'customerForm.vehiclesFailed'),
          reasons: failures.join('; '),
        }),
      )
      setSaving(false)
      return
    }

    onSaved({ customer, vehicles: [...saved.values()] })
  }

  function handleClose() {
    // Committed rows exist even if the vehicle step failed — hand them over
    // rather than dropping them on close.
    if (savedCustomer) {
      onSaved({ customer: savedCustomer, vehicles: [...savedVehicles.values()] })
    } else {
      onClose()
    }
  }

  return (
    <Dialog title={t('customerForm.newTitle')} onClose={handleClose} busy={saving}>
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
          <span>
            {t('customerForm.phone')}{' '}
            <span className="field-hint">{t('customerForm.phoneHint')}</span>
          </span>
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

        {drafts.map((draft, index) => (
          <fieldset className="block" key={index} disabled={saving}>
            <legend className="block-legend">
              {t('customerForm.vehicleLegend', { number: index + 1 })}{' '}
              <span className="field-hint">{t('common.optional')}</span>
              {savedVehicles.has(index) && (
                <span className="pill pill--green">{t('customerForm.vehicleSaved')}</span>
              )}
            </legend>
            <VehicleFields
              draft={draft}
              onChange={(next) => updateDraft(index, next)}
              disabled={saving || savedVehicles.has(index)}
            />
          </fieldset>
        ))}

        <div className="block-actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setDrafts((current) => [...current, emptyVehicleDraft()])}
            disabled={saving}
          >
            {t('customerForm.addAnotherVehicle')}
          </button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving
            ? t('action.saving')
            : savedCustomer
              ? t('customerForm.retryVehicles')
              : t('customerForm.save')}
        </button>
      </form>
    </Dialog>
  )
}
