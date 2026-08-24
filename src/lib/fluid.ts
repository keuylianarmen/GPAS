import type { Database, Json } from '../types/database'
import { detailsObject, detailsText, mergeDetails } from './details'

type Service = Database['public']['Tables']['services']['Row']

export type FluidService = Pick<
  Service,
  'id' | 'fluid_unit' | 'fluid_type_list' | 'fluid_grade_list'
>

export type FluidDraft = {
  type: string
  grade: string
  brand: string
  qty: string
}

export function emptyFluidDraft(): FluidDraft {
  return { type: '', grade: '', brand: '', qty: '' }
}

export function usesFluid(service: FluidService | undefined): boolean {
  return !!service?.fluid_unit
}

/** Short suffix for the quantity field. */
export function unitSuffix(unit: string | null): string {
  if (unit === 'liters') return 'L'
  if (unit === 'grams') return 'g'
  return unit ?? ''
}

export function fluidDraftFromDetails(details: Json): FluidDraft {
  const object = detailsObject(details)
  return {
    type: detailsText(object.fluid_type),
    grade: detailsText(object.fluid_grade),
    brand: detailsText(object.fluid_brand),
    qty: detailsText(object.fluid_qty),
  }
}

export function sameFluid(a: FluidDraft, b: FluidDraft): boolean {
  return a.type === b.type && a.grade === b.grade && a.brand === b.brand && a.qty === b.qty
}

/**
 * Writes the four fluid keys into a line's existing details, leaving anything
 * else in there untouched. A blank field removes its key rather than storing
 * an empty string.
 */
export function mergeFluidDetails(existing: Json, draft: FluidDraft): Json {
  const qty = Number(draft.qty.trim())
  return mergeDetails(existing, {
    fluid_type: draft.type.trim(),
    fluid_grade: draft.grade.trim(),
    fluid_brand: draft.brand.trim(),
    fluid_qty: draft.qty.trim() && Number.isFinite(qty) ? qty : undefined,
  })
}
