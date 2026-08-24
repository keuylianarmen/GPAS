import type { Database, Json } from '../types/database'
import { detailsObject, detailsText, mergeDetails } from './details'

type Service = Database['public']['Tables']['services']['Row']

export type TireService = Pick<Service, 'tracks_tires'>

export const TIRE_QUANTITIES = [1, 2, 3, 4] as const

export type TireDraft = {
  qty: string
  brand: string
  size: string
  dot: string
  condition: string
  rft: boolean
}

export function emptyTireDraft(): TireDraft {
  return { qty: '', brand: '', size: '', dot: '', condition: '', rft: false }
}

export function tracksTires(service: TireService | undefined): boolean {
  return service?.tracks_tires === true
}

export function tireDraftFromDetails(details: Json): TireDraft {
  const object = detailsObject(details)
  return {
    qty: detailsText(object.tire_qty),
    brand: detailsText(object.tire_brand),
    size: detailsText(object.tire_size),
    dot: detailsText(object.tire_dot),
    condition: detailsText(object.tire_condition),
    rft: object.tire_rft === true,
  }
}

export function sameTire(a: TireDraft, b: TireDraft): boolean {
  return (
    a.qty === b.qty &&
    a.brand === b.brand &&
    a.size === b.size &&
    a.dot === b.dot &&
    a.condition === b.condition &&
    a.rft === b.rft
  )
}

/** Same non-destructive merge as the fluid fields. */
export function mergeTireDetails(existing: Json, draft: TireDraft): Json {
  const qty = Number(draft.qty)
  return mergeDetails(existing, {
    tire_qty: draft.qty && Number.isInteger(qty) ? qty : undefined,
    tire_brand: draft.brand.trim(),
    tire_size: draft.size.trim(),
    // Stored as typed: either a year (2025) or a full week-year code (1225).
    tire_dot: draft.dot.trim(),
    tire_condition: draft.condition,
    // Only recorded when true; unchecked means an ordinary tire.
    tire_rft: draft.rft ? true : undefined,
  })
}
