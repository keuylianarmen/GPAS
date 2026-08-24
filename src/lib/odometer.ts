import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { parseOptionalInteger } from './parse'
import type { StringKey } from './i18n'

export type OdometerWarning = 'lower' | 'jump'

export const ODOMETER_WARNINGS: Record<OdometerWarning, StringKey> = {
  lower: 'odometer.lower',
  jump: 'odometer.jump',
}

export async function checkOdometer(
  vehicleId: string,
  reading: number,
): Promise<OdometerWarning | null> {
  // Returns 'lower', 'jump', or null when the reading looks ordinary.
  const { data, error } = await supabase.rpc('odometer_looks_wrong', {
    p_vehicle_id: vehicleId,
    p_reading: reading,
  })

  if (error) {
    // Advisory only — a failed check must never get in the way of saving.
    console.error('Could not check the odometer reading', error)
    return null
  }

  return data === 'lower' || data === 'jump' ? data : null
}

/**
 * Advisory check on a reading as it is typed. The result is tagged with the
 * vehicle and reading it belongs to, so a late reply for an earlier keystroke
 * is ignored rather than shown against the current value.
 */
export function useOdometerCheck(
  vehicleId: string | null,
  raw: string,
): OdometerWarning | null {
  const [result, setResult] = useState<{
    vehicleId: string
    reading: number
    warning: OdometerWarning | null
  } | null>(null)

  const parsed = parseOptionalInteger(raw)
  const reading = typeof parsed === 'number' ? parsed : null

  useEffect(() => {
    if (!vehicleId || reading === null) return

    let cancelled = false
    const timer = setTimeout(() => {
      checkOdometer(vehicleId, reading).then((warning) => {
        if (!cancelled) setResult({ vehicleId, reading, warning })
      })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [vehicleId, reading])

  if (!vehicleId || reading === null || result === null) return null
  if (result.vehicleId !== vehicleId || result.reading !== reading) return null
  return result.warning
}
