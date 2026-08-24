import type { Json } from '../types/database'

/** job_items.details is a shared JSON column, so reads must tolerate anything. */
export function detailsObject(details: Json): Record<string, Json | undefined> {
  return details !== null && typeof details === 'object' && !Array.isArray(details)
    ? details
    : {}
}

export function detailsText(value: Json | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * Sets keys with a value and removes the rest, leaving every other key in the
 * object untouched. A blank field clears its key rather than storing ''.
 */
export function mergeDetails(
  existing: Json,
  values: Record<string, Json | undefined>,
): Json {
  const next: Record<string, Json | undefined> = { ...detailsObject(existing) }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') delete next[key]
    else next[key] = value
  }
  return next as Json
}
