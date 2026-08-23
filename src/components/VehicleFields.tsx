import type { VehicleDraft } from '../lib/vehicle'
import { useLookup } from '../lib/useLookup'
import LookupSelect from './LookupSelect'

export default function VehicleFields({
  draft,
  onChange,
  disabled = false,
  showOdometer = true,
}: {
  draft: VehicleDraft
  onChange: (next: VehicleDraft) => void
  disabled?: boolean
  /** Off when editing: a vehicle's reading is set by jobs, not by hand. */
  showOdometer?: boolean
}) {
  const categories = useLookup('vehicle_category')

  function set(field: keyof VehicleDraft) {
    return (event: { target: { value: string } }) =>
      onChange({ ...draft, [field]: event.target.value })
  }

  return (
    <>
      <div className="grid-2">
        <label className="field">
          <span>Plate</span>
          <input
            className="num"
            value={draft.plate}
            onChange={set('plate')}
            placeholder="21-45678"
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>VIN</span>
          <input
            className="num"
            value={draft.vin}
            onChange={set('vin')}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Make</span>
          <input value={draft.make} onChange={set('make')} disabled={disabled} />
        </label>
        <label className="field">
          <span>Model</span>
          <input value={draft.model} onChange={set('model')} disabled={disabled} />
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Year</span>
          <input
            className="num"
            inputMode="numeric"
            value={draft.year}
            onChange={set('year')}
            placeholder="2019"
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>
            Category <span className="field-hint">optional</span>
          </span>
          <LookupSelect
            value={draft.category}
            options={categories}
            onChange={(next) => onChange({ ...draft, category: next })}
            disabled={disabled}
            blankLabel="Not set"
          />
        </label>
      </div>

      {showOdometer && (
        <label className="field field--narrow">
          <span>
            Odometer <span className="field-hint">km</span>
          </span>
          <input
            className="num"
            inputMode="numeric"
            value={draft.odometer}
            onChange={set('odometer')}
            placeholder="84210"
            disabled={disabled}
          />
        </label>
      )}
    </>
  )
}
