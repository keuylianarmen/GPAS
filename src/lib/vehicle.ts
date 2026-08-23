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

/**
 * A manual edit writes the reading straight to the vehicle and always wins —
 * whoever is editing is looking at the dashboard.
 */
export function vehicleUpdateFrom(
  draft: VehicleDraft,
): VehicleUpdate | { error: string } {
  const year = parseOptionalInteger(draft.year)
  if (year === 'invalid') return { error: 'Year must be a whole number, or left blank.' }

  const odometer = parseOptionalInteger(draft.odometer)
  if (odometer === 'invalid') {
    return { error: 'Odometer must be a whole number, or left blank.' }
  }

  return {
    plate: draft.plate.trim() || null,
    vin: draft.vin.trim() || null,
    make: draft.make.trim() || null,
    model: draft.model.trim() || null,
    year,
    category: draft.category.trim() || null,
    current_odometer: odometer,
  }
}

type VehicleLike = {
  plate: string | null
  make?: string | null
  model?: string | null
}

/**
 * Identifies a vehicle where the plate would otherwise stand alone. Plate is
 * nullable, so fall through to make and model before admitting defeat — the
 * vehicle exists either way.
 */
export function vehicleLabel(vehicle: VehicleLike): string {
  if (vehicle.plate) return vehicle.plate
  const spec = [vehicle.make, vehicle.model].filter(Boolean).join(' ')
  return spec || 'Vehicle, no plate'
}

/**
 * Same, for a job's optional vehicle slot. `vehicle_id` is what decides whether
 * a vehicle is linked at all — a null plate says nothing about that.
 */
export function jobVehicleLabel(
  vehicleId: string | null,
  vehicle: VehicleLike | null | undefined,
): string {
  if (vehicleId === null) return 'No vehicle linked'
  return vehicle ? vehicleLabel(vehicle) : 'Vehicle, no plate'
}
