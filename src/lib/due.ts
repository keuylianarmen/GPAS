import { addMonths } from './date'

type Remindable = {
  triggers_reminder: boolean
  reminder_km: number | null
  reminder_months: number | null
}

/**
 * Default due point for a job line: the reading at the time of the job plus the
 * service's usual interval. Blank where there is nothing to compute from —
 * blank on both means the trigger creates no reminder.
 */
export function dueDefaults(
  service: Remindable | undefined,
  odometer: number | null,
  baseDate: string,
): { nextDueKm: string; nextDueDate: string } {
  if (!service?.triggers_reminder) return { nextDueKm: '', nextDueDate: '' }

  return {
    nextDueKm:
      odometer !== null && service.reminder_km !== null
        ? String(odometer + service.reminder_km)
        : '',
    nextDueDate:
      service.reminder_months !== null
        ? addMonths(baseDate, service.reminder_months)
        : '',
  }
}
