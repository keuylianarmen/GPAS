import type { Database } from '../types/database'
import { parseOptionalInteger, parseOptionalPositiveInteger } from './parse'
import { t } from './i18n'

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
  kmPerDay: string
}

export function emptyVehicleDraft(): VehicleDraft {
  return {
    plate: '',
    vin: '',
    make: '',
    model: '',
    year: '',
    category: '',
    odometer: '',
    kmPerDay: '',
  }
}

/** A block the user never touched is skipped rather than inserted as an empty row. */
export function isBlankVehicle(draft: VehicleDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === '')
}

export function describeVehicle(draft: VehicleDraft, index: number): string {
  const label = draft.plate.trim() || draft.make.trim() || draft.model.trim()
  return label
    ? t('vehicle.numberedNamed', { number: index + 1, label })
    : t('vehicle.numbered', { number: index + 1 })
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
  if (year === 'invalid') return { error: t('vehicle.badYear') }

  const odometer = parseOptionalInteger(draft.odometer)
  if (odometer === 'invalid') return { error: t('vehicle.badOdometer') }

  // Positive, not merely whole: a car doing zero km a day would divide an oil
  // interval into a date that never arrives.
  const kmPerDay = parseOptionalPositiveInteger(draft.kmPerDay)
  if (kmPerDay === 'invalid') return { error: t('vehicle.badKmPerDay') }

  return {
    customer_id: customerId,
    plate: draft.plate.trim() || null,
    vin: draft.vin.trim() || null,
    make: draft.make.trim() || null,
    model: draft.model.trim() || null,
    year,
    category: draft.category.trim() || null,
    current_odometer: odometer,
    km_per_day: kmPerDay,
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
    kmPerDay: vehicle.km_per_day === null ? '' : String(vehicle.km_per_day),
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
  if (year === 'invalid') return { error: t('vehicle.badYear') }

  const odometer = parseOptionalInteger(draft.odometer)
  if (odometer === 'invalid') return { error: t('vehicle.badOdometer') }

  const kmPerDay = parseOptionalPositiveInteger(draft.kmPerDay)
  if (kmPerDay === 'invalid') return { error: t('vehicle.badKmPerDay') }

  return {
    plate: draft.plate.trim() || null,
    vin: draft.vin.trim() || null,
    make: draft.make.trim() || null,
    model: draft.model.trim() || null,
    year,
    category: draft.category.trim() || null,
    current_odometer: odometer,
    km_per_day: kmPerDay,
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
  return spec || t('vehicle.noPlate')
}

/**
 * Same, for a job's optional vehicle slot. `vehicle_id` is what decides whether
 * a vehicle is linked at all — a null plate says nothing about that.
 */
export function jobVehicleLabel(
  vehicleId: string | null,
  vehicle: VehicleLike | null | undefined,
): string {
  if (vehicleId === null) return t('vehicle.notLinked')
  return vehicle ? vehicleLabel(vehicle) : t('vehicle.noPlate')
}
