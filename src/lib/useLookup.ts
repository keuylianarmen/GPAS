import { useEffect, useState } from 'react'
import type { Database } from '../types/database'
import { supabase } from './supabase'

export type LookupValue = Database['public']['Tables']['lookup_values']['Row']

// Lookup lists are small and effectively static, so they are fetched once per
// session. In-flight requests are shared too — several vehicle blocks can mount
// in the same tick and would otherwise each issue the same query.
const cache = new Map<string, LookupValue[]>()
const inFlight = new Map<string, Promise<LookupValue[]>>()

async function load(listKey: string): Promise<LookupValue[]> {
  // The query builder is thenable but not a real Promise, so the shared
  // in-flight entry has to come from an async function.
  const { data, error } = await supabase
    .from('lookup_values')
    .select('*')
    .eq('list_key', listKey)
    .eq('active', true)
    .order('sort_order')

  inFlight.delete(listKey)

  if (error) {
    console.error(`Could not load the ${listKey} list`, error)
    return []
  }

  const rows = data ?? []
  cache.set(listKey, rows)
  return rows
}

function fetchList(listKey: string): Promise<LookupValue[]> {
  const pending = inFlight.get(listKey)
  if (pending) return pending

  const request = load(listKey)
  inFlight.set(listKey, request)
  return request
}

export function useLookup(listKey: string): LookupValue[] {
  const [values, setValues] = useState<LookupValue[]>(() => cache.get(listKey) ?? [])

  useEffect(() => {
    if (cache.has(listKey)) return

    let cancelled = false
    fetchList(listKey).then((rows) => {
      if (!cancelled) setValues(rows)
    })

    return () => {
      cancelled = true
    }
  }, [listKey])

  return values
}
