/** Local calendar date as YYYY-MM-DD — the shop's today, not UTC's. */
export function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Adds whole months to a YYYY-MM-DD date, clamping to the end of the target
 * month so 31 January plus one month lands on 28 February, not 3 March.
 */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const daysInTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, daysInTargetMonth))
  return target.toISOString().slice(0, 10)
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day + days))
  return target.toISOString().slice(0, 10)
}
