import { useId, useMemo } from 'react'
import { useLookup } from '../lib/useLookup'
import { useTireOptions, useVehicleTireSizes } from '../lib/useTireOptions'
import { TIRE_QUANTITIES } from '../lib/tire'
import type { TireDraft } from '../lib/tire'
import LookupSelect from './LookupSelect'
import { t } from '../lib/i18n'

/**
 * Tire capture for a job line, in the same compact grammar as the fluid
 * section. One line carries one brand and size — different sizes front and
 * rear, or two brands, are two lines.
 */
export default function TireFields({
  draft,
  vehicleId,
  onChange,
  disabled = false,
}: {
  draft: TireDraft
  /** Drives the vehicle's own sizes to the top of the size list. */
  vehicleId: string | null
  onChange: (next: TireDraft) => void
  disabled?: boolean
}) {
  const conditions = useLookup('parts_condition')
  const { brands, sizes } = useTireOptions()
  const vehicleSizes = useVehicleTireSizes(vehicleId)
  const brandListId = useId()
  const sizeListId = useId()

  // This vehicle's own sizes lead, then the rest of the shop's, deduped.
  const sizeOptions = useMemo(() => {
    const seen = new Set(vehicleSizes.map((row) => row.size))
    return [
      ...vehicleSizes.map((row) => ({
        size: row.size,
        hint: row.lastBrand
          ? t('tire.lastFitted', { brand: row.lastBrand })
          : t('tire.fittedBefore'),
      })),
      ...sizes
        .filter((size) => !seen.has(size))
        .map((size) => ({ size, hint: '' })),
    ]
  }, [vehicleSizes, sizes])

  return (
    <div className="tires">
      <div className="tire tire--qty">
        <span>{t('tire.quantity')}</span>
        <div className="segmented" role="group" aria-label={t('tire.quantity')}>
          {TIRE_QUANTITIES.map((count) => {
            const value = String(count)
            const active = draft.qty === value
            return (
              <button
                type="button"
                key={count}
                className="segment num"
                aria-pressed={active}
                disabled={disabled}
                // Pressing the active one clears it — the field is optional.
                onClick={() => onChange({ ...draft, qty: active ? '' : value })}
              >
                {count}
              </button>
            )
          })}
        </div>
      </div>

      <label className="tire">
        <span>{t('tire.brand')}</span>
        <input
          value={draft.brand}
          onChange={(event) => onChange({ ...draft, brand: event.target.value })}
          list={brandListId}
          disabled={disabled}
        />
        <datalist id={brandListId}>
          {brands.map((brand) => (
            <option key={brand} value={brand} />
          ))}
        </datalist>
      </label>

      <label className="tire tire--wide">
        <span>{t('tire.size')}</span>
        <input
          value={draft.size}
          onChange={(event) => onChange({ ...draft, size: event.target.value })}
          list={sizeListId}
          placeholder={t('tire.sizePlaceholder')}
          disabled={disabled}
        />
        <datalist id={sizeListId}>
          {sizeOptions.map((option) => (
            <option key={option.size} value={option.size}>
              {option.hint}
            </option>
          ))}
        </datalist>
      </label>

      <label className="tire tire--narrow">
        <span>
          {t('tire.dot')} <span className="field-hint">{t('tire.dotHint')}</span>
        </span>
        <input
          className="num"
          inputMode="numeric"
          maxLength={4}
          value={draft.dot}
          onChange={(event) => onChange({ ...draft, dot: event.target.value })}
          placeholder={t('tire.dotPlaceholder')}
          disabled={disabled}
        />
      </label>

      <label className="tire">
        <span>{t('tire.condition')}</span>
        <LookupSelect
          value={draft.condition}
          options={conditions}
          onChange={(next) => onChange({ ...draft, condition: next })}
          disabled={disabled}
          blankLabel={t('common.notSet')}
        />
      </label>

      <label className="tire tire--check">
        <input
          type="checkbox"
          checked={draft.rft}
          onChange={(event) => onChange({ ...draft, rft: event.target.checked })}
          disabled={disabled}
        />
        {t('tire.runFlat')}
      </label>
    </div>
  )
}
