import { useId } from 'react'
import { useLookup } from '../lib/useLookup'
import { useFluidBrands } from '../lib/useFluidBrands'
import { unitSuffix } from '../lib/fluid'
import type { FluidDraft, FluidService } from '../lib/fluid'
import LookupSelect from './LookupSelect'

/**
 * Fluid capture for a job line, on one compact row beside the prices. Type and
 * grade only appear when the service names a list for them — power steering
 * has no standard type list, and only oil has grades. All optional.
 */
export default function FluidFields({
  service,
  draft,
  onChange,
  disabled = false,
}: {
  service: FluidService
  draft: FluidDraft
  onChange: (next: FluidDraft) => void
  disabled?: boolean
}) {
  const types = useLookup(service.fluid_type_list ?? '')
  const grades = useLookup(service.fluid_grade_list ?? '')
  const brands = useFluidBrands(service.id)
  const brandListId = useId()

  return (
    <div className="fluids">
      {service.fluid_type_list && (
        <label className="fluid fluid--wide">
          <span>Type</span>
          <LookupSelect
            value={draft.type}
            options={types}
            onChange={(next) => onChange({ ...draft, type: next })}
            disabled={disabled}
            blankLabel="Not set"
          />
        </label>
      )}

      {service.fluid_grade_list && (
        <label className="fluid">
          <span>Grade</span>
          <LookupSelect
            value={draft.grade}
            options={grades}
            onChange={(next) => onChange({ ...draft, grade: next })}
            disabled={disabled}
            blankLabel="Not set"
          />
        </label>
      )}

      <label className="fluid fluid--wide">
        <span>Brand</span>
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

      <label className="fluid">
        <span>
          Quantity{' '}
          <span className="field-hint">{unitSuffix(service.fluid_unit)}</span>
        </span>
        <input
          className="num"
          inputMode="decimal"
          value={draft.qty}
          onChange={(event) => onChange({ ...draft, qty: event.target.value })}
          placeholder="0"
          disabled={disabled}
        />
      </label>
    </div>
  )
}
