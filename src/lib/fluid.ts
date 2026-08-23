import type { Database, Json } from '../types/database'

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

function asObject(details: Json): Record<string, Json | undefined> {
  return details !== null && typeof details === 'object' && !Array.isArray(details)
    ? details
    : {}
}

function asText(value: Json | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function fluidDraftFromDetails(details: Json): FluidDraft {
  const object = asObject(details)
  return {
    type: asText(object.fluid_type),
    grade: asText(object.fluid_grade),
    brand: asText(object.fluid_brand),
    qty: asText(object.fluid_qty),
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
  const next: Record<string, Json | undefined> = { ...asObject(existing) }

  const values: Record<string, string> = {
    fluid_type: draft.type.trim(),
    fluid_grade: draft.grade.trim(),
    fluid_brand: draft.brand.trim(),
  }

  for (const [key, value] of Object.entries(values)) {
    if (value) next[key] = value
    else delete next[key]
  }

  const qty = Number(draft.qty.trim())
  if (draft.qty.trim() && Number.isFinite(qty)) next.fluid_qty = qty
  else delete next.fluid_qty

  return next as Json
}

/** Details for a brand new line — nothing to preserve. */
export function fluidDetails(draft: FluidDraft): Json {
  return mergeFluidDetails({}, draft)
}

export function hasFluidValues(details: Json): boolean {
  return Object.keys(asObject(details)).length > 0
}
