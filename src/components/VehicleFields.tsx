import { useState } from 'react'
import type { ReactNode } from 'react'
import type { VehicleDraft } from '../lib/vehicle'
import { useLookup } from '../lib/useLookup'
import ModelField from './ModelField'
import LookupSelect from './LookupSelect'
import { t } from '../lib/i18n'
import AddMakeDialog from './AddMakeDialog'

export default function VehicleFields({
  draft,
  onChange,
  disabled = false,
  odometerNote,
}: {
  draft: VehicleDraft
  onChange: (next: VehicleDraft) => void
  disabled?: boolean
  /** Advisory note rendered under the odometer, when a vehicle is known. */
  odometerNote?: ReactNode
}) {
  const categories = useLookup('vehicle_category')
  const makes = useLookup('vehicle_make')
  const [addingMake, setAddingMake] = useState(false)

  function set(field: keyof VehicleDraft) {
    return (event: { target: { value: string } }) =>
      onChange({ ...draft, [field]: event.target.value })
  }

  return (
    <>
      <div className="grid-2">
        <label className="field">
          <span>{t('vehicleForm.plate')}</span>
          <input
            className="num"
            value={draft.plate}
            onChange={set('plate')}
            placeholder={t('vehicleForm.platePlaceholder')}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>{t('vehicleForm.vin')}</span>
          <input
            className="num"
            value={draft.vin}
            onChange={set('vin')}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="grid-2">
        <div>
          <label className="field field--tight">
            <span>{t('vehicleForm.make')}</span>
            <LookupSelect
              value={draft.make}
              options={makes}
              // vehicles.make is free text holding the display name, so the
              // label is stored rather than the list's key.
              store="label_en"
              onChange={(next) => onChange({ ...draft, make: next, model: '' })}
              disabled={disabled}
              blankLabel={t('common.notSet')}
            />
          </label>
          <button
            type="button"
            className="btn btn--quiet btn--small field-action"
            onClick={() => setAddingMake(true)}
            disabled={disabled}
          >
            {t('vehicleForm.addMake')}
          </button>
        </div>
        <label className="field">
          <span>{t('vehicleForm.model')}</span>
          {/* Suggests from the make's lineup and from what this shop has
              already used; anything can still be typed. */}
          <ModelField
            make={draft.make}
            value={draft.model}
            onChange={(model) => onChange({ ...draft, model })}
            disabled={disabled}
          />
        </label>
      </div>

      {addingMake && (
        <AddMakeDialog
          onClose={() => setAddingMake(false)}
          onSaved={(label) => {
            onChange({ ...draft, make: label, model: '' })
            setAddingMake(false)
          }}
        />
      )}

      <div className="grid-2">
        <label className="field">
          <span>{t('vehicleForm.year')}</span>
          <input
            className="num"
            inputMode="numeric"
            value={draft.year}
            onChange={set('year')}
            placeholder={t('vehicleForm.yearPlaceholder')}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>
            {t('vehicleForm.category')}{' '}
            <span className="field-hint">{t('common.optional')}</span>
          </span>
          <LookupSelect
            value={draft.category}
            options={categories}
            onChange={(next) => onChange({ ...draft, category: next })}
            disabled={disabled}
            blankLabel={t('common.notSet')}
          />
        </label>
      </div>

      <label className="field field--narrow">
        <span>
          {t('vehicleForm.odometer')}{' '}
          <span className="field-hint">{t('common.km')}</span>
        </span>
        <input
          className="num"
          inputMode="numeric"
          value={draft.odometer}
          onChange={set('odometer')}
          placeholder={t('vehicleForm.odometerPlaceholder')}
          disabled={disabled}
        />
      </label>
      {odometerNote}

      {/* Directly under the reading, because it is the same conversation: what
          the car has done, then how fast it does it. Worded as the question
          actually asked at the counter rather than as a spec — nobody knows
          their car's "daily average", everybody knows roughly how far they
          drive. An estimate is the point; blank is a fine answer. */}
      <label className="field field--narrow">
        <span>
          {t('vehicleForm.kmPerDay')}{' '}
          <span className="field-hint">{t('common.optional')}</span>
        </span>
        <input
          className="num"
          inputMode="numeric"
          value={draft.kmPerDay}
          onChange={set('kmPerDay')}
          disabled={disabled}
        />
      </label>
      <p className="field-note">{t('vehicleForm.kmPerDayNote')}</p>
    </>
  )
}
