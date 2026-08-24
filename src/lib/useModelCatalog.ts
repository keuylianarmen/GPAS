import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { fetchModelCatalog } from './translateService'
import type { CatalogModel } from './translateService'
import { makeTrace } from './suggest'

const trace = makeTrace('model catalogue')

/** Stable identity: a fresh [] would rebuild every memo downstream. */
const NONE: CatalogModel[] = []

export type ModelCatalog = {
  models: CatalogModel[]
  /** A first fetch for this make is in flight. Never blocks the field. */
  loading: boolean
}

const IDLE: ModelCatalog = { models: NONE, loading: false }

/**
 * One entry per make, shared by every mounted field.
 *
 * `settled` is separate from `models` because an empty answer is still an
 * answer: a make with no lineup settles with no models and must not be asked
 * about again.
 *
 * Entries are replaced rather than mutated, so the object identity a
 * useSyncExternalStore snapshot hands back only changes when something
 * actually did.
 */
type Entry = ModelCatalog & { settled: boolean }

const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<void>>()
const listeners = new Map<string, Set<() => void>>()

function publish(make: string, entry: Entry) {
  entries.set(make, entry)
  listeners.get(make)?.forEach((notify) => notify())
}

async function load(make: string): Promise<void> {
  publish(make, { models: NONE, loading: true, settled: false })

  try {
    // The table is the shared cache — one make reaches the model once, ever,
    // across all staff. Everything after that is this read.
    const [stored, asked] = await Promise.all([
      supabase
        .from('vehicle_model_catalog')
        .select('name_en, name_ar')
        .eq('make', make)
        .eq('active', true)
        .order('name_en'),
      supabase
        .from('vehicle_model_fetches')
        .select('make')
        .eq('make', make)
        .maybeSingle(),
    ])

    if (stored.error) {
      // A read failure is not an answer; leave it unsettled so it retries.
      console.error('Could not read the model catalogue', stored.error)
      publish(make, { models: NONE, loading: false, settled: false })
      return
    }

    const rows = stored.data ?? []
    if (rows.length > 0) {
      trace('served from the table', { make, models: rows.length })
      publish(make, { models: rows, loading: false, settled: true })
      return
    }

    if (asked.data) {
      trace("no lineup for this make; the shop's own models stand alone", { make })
      publish(make, { models: NONE, loading: false, settled: true })
      return
    }

    trace('never asked about this make; fetching once', { make })
    const fetched = await fetchModelCatalog(make)

    if (fetched === null) {
      // The call failed and nothing was recorded, so the next selection
      // retries. Unsettled, not empty.
      trace('fetch failed; will try again next time this make is selected', { make })
      publish(make, { models: NONE, loading: false, settled: false })
      return
    }

    trace('fetched and stored', { make, models: fetched.length })
    publish(make, { models: fetched, loading: false, settled: true })
  } finally {
    // Cleared only once the whole load is done — including the edge call.
    // Clearing it after the table read let a second field start a duplicate
    // fetch during the seconds the model was still answering.
    inFlight.delete(make)
  }
}

function start(make: string) {
  if (inFlight.has(make)) return
  const entry = entries.get(make)
  if (entry?.settled) return

  inFlight.set(make, load(make))
}

/**
 * Every model the selected make sells, from the shared catalogue.
 *
 * Subscribed rather than fetched-and-held: when a make's list arrives, every
 * mounted field for that make is told, so a list that lands while the form is
 * open appears in it. The first ever use of a make is the one time this
 * matters, and it is also the one time the list is worth the most.
 *
 * Empty with no make selected — without one there is nothing to fetch and no
 * context that would make a suggestion worth anything.
 */
export function useModelCatalog(make: string): ModelCatalog {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!make) return () => {}

      const forMake = listeners.get(make) ?? new Set<() => void>()
      listeners.set(make, forMake)
      forMake.add(onChange)

      return () => {
        forMake.delete(onChange)
      }
    },
    [make],
  )

  // Reads the entry for the make being rendered right now. A reply for a make
  // that has since been changed away from is published under its own key and
  // announced only to that key's listeners — which this field left when the
  // make changed — so it can never land against the new one.
  const snapshot = useCallback(() => (make ? entries.get(make) ?? IDLE : IDLE), [make])

  const entry = useSyncExternalStore(subscribe, snapshot, snapshot)

  useEffect(() => {
    if (make) start(make)
  }, [make])

  return entry
}
