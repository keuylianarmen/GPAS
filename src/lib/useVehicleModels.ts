import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Models already entered for a make, most used first. Feeds a datalist, so it
 * is a typeahead only — the field still accepts anything.
 */
export function useVehicleModels(make: string): string[] {
  const [result, setResult] = useState<{ make: string; models: string[] } | null>(null)

  useEffect(() => {
    if (!make) return

    let cancelled = false
    supabase
      .from('v_vehicle_models')
      .select('model, uses')
      .eq('make', make)
      .order('uses', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load models for this make', error)
          return
        }
        setResult({
          make,
          models: (data ?? []).flatMap((row) => (row.model ? [row.model] : [])),
        })
      })

    return () => {
      cancelled = true
    }
  }, [make])

  // Tagged so a late reply for a previous make is never offered for this one.
  return result !== null && result.make === make ? result.models : []
}
