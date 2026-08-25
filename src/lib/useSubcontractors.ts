import { useEffect, useState } from 'react'
import type { Database } from '../types/database'
import { supabase } from './supabase'

export type Subcontractor = Database['public']['Tables']['subcontractors']['Row']

/**
 * The active subcontractors, fetched once per session and shared.
 *
 * Same shape as useLookup: several job lines mount at once and would each
 * issue the same query in the same tick otherwise.
 */
const listeners = new Set<() => void>()
let cache: Subcontractor[] | null = null
let inFlight: Promise<Subcontractor[]> | null = null

async function load(): Promise<Subcontractor[]> {
  const { data, error } = await supabase
    .from('subcontractors')
    .select('*')
    .eq('active', true)
    .order('name')

  inFlight = null

  if (error) {
    console.error('Could not load subcontractors', error)
    return []
  }

  cache = data ?? []
  return cache
}

function fetchList(): Promise<Subcontractor[]> {
  if (inFlight) return inFlight
  inFlight = load()
  return inFlight
}

export function useSubcontractors(): Subcontractor[] {
  const [rows, setRows] = useState<Subcontractor[]>(() => cache ?? [])

  useEffect(() => {
    if (cache === null) {
      let cancelled = false
      fetchList().then((loaded) => {
        if (!cancelled) setRows(loaded)
      })
      return () => {
        cancelled = true
      }
    }
  }, [])

  useEffect(() => {
    const onChange = () => setRows(cache ?? [])
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  return rows
}

/** Refetches and pushes to every mounted picker, so a new one appears at once. */
export async function invalidateSubcontractors(): Promise<Subcontractor[]> {
  cache = null
  const rows = await fetchList()
  listeners.forEach((notify) => notify())
  return rows
}
