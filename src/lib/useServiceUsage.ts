import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type ServiceUsage = { uses90d: number; uses: number }

// Shop-wide and slow moving, so it is fetched once and shared.
let cache: Map<string, ServiceUsage> | null = null
let inFlight: Promise<Map<string, ServiceUsage>> | null = null

async function load(): Promise<Map<string, ServiceUsage>> {
  const { data, error } = await supabase
    .from('v_service_usage')
    .select('service_id, uses_90d, uses')

  inFlight = null

  if (error) {
    console.error('Could not load service usage', error)
    return new Map()
  }

  cache = new Map(
    (data ?? []).flatMap((row) =>
      row.service_id
        ? [[row.service_id, { uses90d: row.uses_90d ?? 0, uses: row.uses ?? 0 }] as const]
        : [],
    ),
  )
  return cache
}

export function useServiceUsage(): Map<string, ServiceUsage> {
  const [usage, setUsage] = useState<Map<string, ServiceUsage>>(
    () => cache ?? new Map(),
  )

  useEffect(() => {
    if (cache) return

    let cancelled = false
    inFlight = inFlight ?? load()
    inFlight.then((rows) => {
      if (!cancelled) setUsage(rows)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return usage
}
