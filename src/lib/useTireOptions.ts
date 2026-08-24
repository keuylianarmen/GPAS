import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type TireOptions = { brands: string[]; sizes: string[] }

const EMPTY: TireOptions = { brands: [], sizes: [] }

// Shop-wide lists, so they are fetched once and shared — several tire lines can
// mount at the same time and would otherwise each issue the same two queries.
let cache: TireOptions | null = null
let inFlight: Promise<TireOptions> | null = null

async function load(): Promise<TireOptions> {
  const [brandResult, sizeResult] = await Promise.all([
    supabase.from('v_tire_brands').select('brand').order('uses', { ascending: false }),
    supabase.from('v_tire_sizes').select('size').order('uses', { ascending: false }),
  ])

  inFlight = null

  if (brandResult.error || sizeResult.error) {
    console.error(
      'Could not load tire options',
      brandResult.error ?? sizeResult.error,
    )
    return EMPTY
  }

  cache = {
    brands: (brandResult.data ?? []).flatMap((row) => (row.brand ? [row.brand] : [])),
    sizes: (sizeResult.data ?? []).flatMap((row) => (row.size ? [row.size] : [])),
  }
  return cache
}

export function useTireOptions(): TireOptions {
  const [options, setOptions] = useState<TireOptions>(() => cache ?? EMPTY)

  useEffect(() => {
    if (cache) return

    let cancelled = false
    inFlight = inFlight ?? load()
    inFlight.then((rows) => {
      if (!cancelled) setOptions(rows)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return options
}

export type VehicleTireSize = { size: string; lastBrand: string | null }

/** Sizes this vehicle has worn before — a car usually keeps the same size. */
export function useVehicleTireSizes(vehicleId: string | null): VehicleTireSize[] {
  const [result, setResult] = useState<{
    vehicleId: string
    sizes: VehicleTireSize[]
  } | null>(null)

  useEffect(() => {
    if (!vehicleId) return

    let cancelled = false
    supabase
      .from('v_vehicle_tire_sizes')
      .select('size, last_brand, last_fitted')
      .eq('vehicle_id', vehicleId)
      .order('last_fitted', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load this vehicle’s tire sizes', error)
          return
        }
        setResult({
          vehicleId,
          sizes: (data ?? []).flatMap((row) =>
            row.size ? [{ size: row.size, lastBrand: row.last_brand }] : [],
          ),
        })
      })

    return () => {
      cancelled = true
    }
  }, [vehicleId])

  // Tagged so a late reply for another vehicle is never offered here.
  return result !== null && result.vehicleId === vehicleId ? result.sizes : []
}
