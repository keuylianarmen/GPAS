import type { Json } from '../types/database'
import { detailsObject } from './details'
import { mergeFluidDetails } from './fluid'
import type { FluidDraft } from './fluid'
import { mergeTireDetails } from './tire'
import type { TireDraft } from './tire'

/**
 * The details payload for one job line — always an object, never null.
 *
 * job_items.details is NOT NULL, and a bulk insert cannot simply omit the key
 * on the lines that have nothing to store: postgrest-js sends the union of
 * keys across every row in the array, so a row missing `details` is written as
 * NULL rather than falling back to the column default. Sending `{}` everywhere
 * keeps the rows uniform.
 */
export function lineDetails(
  existing: Json,
  fluid: FluidDraft,
  tire: TireDraft,
): Json {
  const merged = mergeTireDetails(mergeFluidDetails(existing, fluid), tire)
  return detailsObject(merged) as Json
}
