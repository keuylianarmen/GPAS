/** Money is numeric(12,3) in the database, so it always shows three decimals. */
export function money(value: number | null): string {
  if (value === null) return '—'
  const amount = Number(value)
  return Number.isFinite(amount) ? amount.toFixed(3) : '—'
}

/** Fixed locale so grouped digits stay ASCII next to the monospace figures. */
export function km(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * "5,000 km / 6 months" — whichever halves of the rule are set.
 * Returns null when a service triggers a reminder but has no interval at all.
 */
export function reminderRule(
  reminderKm: number | null,
  reminderMonths: number | null,
): string | null {
  const parts: string[] = []
  if (reminderKm !== null) parts.push(`${km(reminderKm)} km`)
  if (reminderMonths !== null) {
    parts.push(reminderMonths === 1 ? '1 month' : `${reminderMonths} months`)
  }
  return parts.length > 0 ? parts.join(' / ') : null
}
