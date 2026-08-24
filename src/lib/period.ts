import { t } from './i18n'
import type { StringKey } from './i18n'

export type Period = 'this-month' | 'last-3-months' | 'this-year' | 'all-time'

export const PERIODS: { key: Period; labelKey: StringKey }[] = [
  { key: 'this-month', labelKey: 'period.thisMonth' },
  { key: 'last-3-months', labelKey: 'period.last3Months' },
  { key: 'this-year', labelKey: 'period.thisYear' },
  { key: 'all-time', labelKey: 'period.allTime' },
]

/**
 * Inclusive lower bound as a YYYY-MM-DD date; null means unbounded. The stats
 * views are keyed by first-of-month, so plain string comparison is enough.
 * "Last 3 months" includes the current one.
 */
export function periodStart(period: Period, today: string): string | null {
  const [year, month] = today.split('-').map(Number)

  if (period === 'this-month') return `${today.slice(0, 7)}-01`
  if (period === 'last-3-months') {
    return new Date(Date.UTC(year, month - 3, 1)).toISOString().slice(0, 10)
  }
  if (period === 'this-year') return `${year}-01-01`
  return null
}

export function withinPeriod(date: string | null, start: string | null): boolean {
  if (date === null) return false
  return start === null || date >= start
}

/** "2025-06-01" → "Jun 25" */
export function monthLabel(month: string | null): string {
  if (!month) return ''
  const [year, index] = month.split('-')
  const key = `month.${Number(index)}` as StringKey
  return `${t(key)} ${year.slice(2)}`
}
