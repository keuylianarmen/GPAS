import type { Database } from '../types/database'
import { parseOptionalInteger } from './parse'

type Vehicle = Database['public']['Tables']['vehicles']['Row']
type VehicleInsert = Database['public']['Tables']['vehicles']['Insert']
type VehicleUpdate = Database['public']['Tables']['vehicles']['Update']

export type VehicleDraft = {
  plate: string
  vin: string
  make: string
  model: string
  year: string
  category: string
  odometer: string
}

export function emptyVehicleDraft(): VehicleDraft {
  return { plate: '', vin: '', make: '', model: '', year: '', category: '', odometer: '' }
}

/** A block the user never touched is skipped rather than inserted as an empty row. */
export function isBlankVehicle(draft: VehicleDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === '')
}

export function describeVehicle(draft: VehicleDraft, index: number): string {
  const label = draft.plate.trim() || draft.make.trim() || draft.model.trim()
  return label ? `vehicle ${index + 1} (${label})` : `vehicle ${index + 1}`
}

/**
 * VIN is accepted as typed — the column is nullable with no uniqueness
 * constraint, so there is nothing to validate against yet.
 */
export function vehicleInsertFrom(
  draft: VehicleDraft,
  customerId: string,
): VehicleInsert | { error: string } {
  const year = parseOptionalInteger(draft.year)
  if (year === 'invalid') return { error: 'Year must be a whole number, or left blank.' }

  const odometer = parseOptionalInteger(draft.odometer)
  if (odometer === 'invalid') {
    return { error: 'Odometer must be a whole number, or left blank.' }
  }

  return {
    customer_id: customerId,
    plate: draft.plate.trim() || null,
    vin: draft.vin.trim() || null,
    make: draft.make.trim() || null,
    model: draft.model.trim() || null,
    year,
    category: draft.category.trim() || null,
    current_odometer: odometer,
  }
}

export function draftFromVehicle(vehicle: Vehicle): VehicleDraft {
  return {
    plate: vehicle.plate ?? '',
    vin: vehicle.vin ?? '',
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    year: vehicle.year === null ? '' : String(vehicle.year),
    category: vehicle.category ?? '',
    odometer: vehicle.current_odometer === null ? '' : String(vehicle.current_odometer),
  }
}

/** Edits cover identity fields only — the odometer is driven by jobs. */
export function vehicleUpdateFrom(
  draft: VehicleDraft,
): VehicleUpdate | { error: string } {
  const year = parseOptionalInteger(draft.year)
  if (year === 'invalid') return { error: 'Year must be a whole number, or left blank.' }

  return {
    plate: draft.plate.trim() || null,
    vin: draft.vin.trim() || null,
    make: draft.make.trim() || null,
    model: draft.model.trim() || null,
    year,
    category: draft.category.trim() || null,
  }
}
