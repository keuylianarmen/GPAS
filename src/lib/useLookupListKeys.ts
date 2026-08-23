import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * The distinct list_key values in lookup_values, so a new fluid service can be
 * pointed at an existing list without touching the database.
 */
export function useLookupListKeys(): string[] {
  const [keys, setKeys] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    supabase
      .from('lookup_values')
      .select('list_key')
      .order('list_key')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load the lookup lists', error)
          return
        }
        // PostgREST has no DISTINCT, so the column is deduped here.
        setKeys([...new Set((data ?? []).map((row) => row.list_key))])
      })

    return () => {
      cancelled = true
    }
  }, [])

  return keys
}
