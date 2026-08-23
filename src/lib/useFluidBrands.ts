import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Brands already entered for a service, most used first. Keyed on service_id,
 * so services created in the app get suggestions even without a code.
 * Self-building typeahead — the field still accepts anything.
 */
export function useFluidBrands(serviceId: string): string[] {
  const [result, setResult] = useState<{ serviceId: string; brands: string[] } | null>(
    null,
  )

  useEffect(() => {
    if (!serviceId) return

    let cancelled = false
    supabase
      .from('v_fluid_brands')
      .select('brand, uses')
      .eq('service_id', serviceId)
      .order('uses', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load fluid brands', error)
          return
        }
        setResult({
          serviceId,
          brands: (data ?? []).flatMap((row) => (row.brand ? [row.brand] : [])),
        })
      })

    return () => {
      cancelled = true
    }
  }, [serviceId])

  // Tagged so a late reply for another service is never offered here.
  return result !== null && result.serviceId === serviceId ? result.brands : []
}
