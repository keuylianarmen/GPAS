import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { ODOMETER_WARNINGS, useOdometerCheck } from '../lib/odometer'
import Dialog from './Dialog'
import { t } from '../lib/i18n'
import VehicleFields from './VehicleFields'
import {
  draftFromVehicle,
  emptyVehicleDraft,
  isBlankVehicle,
  vehicleInsertFrom,
  vehicleUpdateFrom,
} from '../lib/vehicle'
import type { VehicleDraft } from '../lib/vehicle'

type Vehicle = Database['public']['Tables']['vehicles']['Row']

/** Passing `vehicle` edits it in place; leaving it out adds a new one. */
export default function VehicleDialog({
  customerId,
  vehicle,
  onClose,
  onSaved,
}: {
  customerId: string
  vehicle?: Vehicle
  onClose: () => void
  onSaved: (vehicle: Vehicle) => void
}) {
  const editing = vehicle !== undefined
  const [draft, setDraft] = useState<VehicleDraft>(
    vehicle ? draftFromVehicle(vehicle) : emptyVehicleDraft(),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Only meaningful once the vehicle exists; a new one has nothing to compare to.
  const odometerWarning = useOdometerCheck(vehicle?.id ?? null, draft.odometer)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    // Branched rather than unified: Insert and Update have different required
    // fields, and a merged payload type satisfies neither call.
    if (vehicle) {
      const payload = vehicleUpdateFrom(draft)
      if ('error' in payload) {
        setError(payload.error)
        return
      }

      setSaving(true)
      const { data, error: updateError } = await supabase
        .from('vehicles')
        .update(payload)
        .eq('id', vehicle.id)
        .select()
        .single()

      if (updateError || !data) {
        setError(updateError?.message ?? t('vehicleForm.saveFailed'))
        setSaving(false)
        return
      }
      onSaved(data)
      return
    }

    if (isBlankVehicle(draft)) {
      setError(t('vehicleForm.needSomething'))
      return
    }

    const payload = vehicleInsertFrom(draft, customerId)
    if ('error' in payload) {
      setError(payload.error)
      return
    }

    setSaving(true)
    const { data, error: insertError } = await supabase
      .from('vehicles')
      .insert(payload)
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? t('vehicleForm.saveFailed'))
      setSaving(false)
      return
    }
    onSaved(data)
  }

  return (
    <Dialog
      title={editing ? t('vehicleForm.editTitle') : t('vehicleForm.newTitle')}
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} noValidate>
        <VehicleFields
          draft={draft}
          onChange={setDraft}
          disabled={saving}
          odometerNote={
            odometerWarning && (
              <p className="field-warning">
                {t(ODOMETER_WARNINGS[odometerWarning])}
              </p>
            )
          }
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving
            ? t('action.saving')
            : editing
              ? t('action.saveChanges')
              : t('vehicleForm.save')}
        </button>
      </form>
    </Dialog>
  )
}
