import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { fetchModelCatalog } from './translateService'
import type { CatalogModel } from './translateService'
import { makeTrace } from './suggest'

const trace = makeTrace('model catalogue')

// Same shape as useLookup: one fetch per make per session, shared by every
// mounted VehicleFields. Several vehicle blocks on one customer form would
// otherwise each issue the same query in the same tick.
const cache = new Map<string, CatalogModel[]>()
const inFlight = new Map<string, Promise<CatalogModel[]>>()

async function load(make: string): Promise<CatalogModel[]> {
  // The table is the shared cache — one make is fetched from the model once,
  // ever, across all staff. Everything after that is this read.
  const [stored, asked] = await Promise.all([
    supabase
      .from('vehicle_model_catalog')
      .select('name_en, name_ar')
      .eq('make', make)
      .eq('active', true)
      .order('name_en'),
    supabase.from('vehicle_model_fetches').select('make').eq('make', make).maybeSingle(),
  ])

  inFlight.delete(make)

  if (stored.error) {
    // A read failure is not an answer; leave the cache empty so it retries.
    console.error('Could not read the model catalogue', stored.error)
    return []
  }

  const rows = stored.data ?? []
  if (rows.length > 0) {
    trace('served from the table', { make, models: rows.length })
    cache.set(make, rows)
    return rows
  }

  if (asked.data) {
    // Asked before, and the answer was genuinely empty. Not asking again.
    trace('no lineup for this make; the shop\'s own models stand alone', { make })
    cache.set(make, [])
    return []
  }

  trace('never asked about this make; fetching once', { make })
  const fetched = await fetchModelCatalog(make)
  if (fetched === null) {
    // The call failed and nothing was recorded, so the next selection retries.
    trace('fetch failed; will try again next time this make is selected', { make })
    return []
  }

  trace('fetched and stored', { make, models: fetched.length })
  cache.set(make, fetched)
  return fetched
}

function fetchList(make: string): Promise<CatalogModel[]> {
  const pending = inFlight.get(make)
  if (pending) return pending

  const request = load(make)
  inFlight.set(make, request)
  return request
}

/** Stable identity: a fresh [] every render would rebuild every memo downstream. */
const NONE: CatalogModel[] = []

/**
 * Every model the selected make sells, from the shared catalogue.
 *
 * Empty with no make selected — without one there is no list to fetch and no
 * context that would make a suggestion worth anything.
 */
export function useModelCatalog(make: string): CatalogModel[] {
  // Tagged with the make it was fetched for, so a late reply for a previous
  // make is never offered for this one.
  const [loaded, setLoaded] = useState<{ make: string; rows: CatalogModel[] } | null>(
    null,
  )

  useEffect(() => {
    if (!make || cache.has(make)) return

    let cancelled = false
    fetchList(make).then((rows) => {
      if (!cancelled) setLoaded({ make, rows })
    })

    return () => {
      cancelled = true
    }
  }, [make])

  if (!make) return NONE
  return cache.get(make) ?? (loaded?.make === make ? loaded.rows : NONE)
}
