import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { supabase } from './supabase'

export type Staff = Database['public']['Tables']['staff']['Row']
export type StaffRole = Database['public']['Enums']['staff_role']

export type UseStaffResult = {
  session: Session | null
  staff: Staff | null
  loading: boolean
}

/**
 * Tracks the Supabase auth session and the staff row it belongs to.
 *
 * `staff` is null when nobody is signed in, and also when the signed-in user
 * has no row in the staff table — callers tell those apart with `session`.
 */
export function useStaff(): UseStaffResult {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  // Tagged with the user id it was fetched for, so a row is never read back
  // for the wrong user while a sign-in or sign-out is settling.
  const [lookup, setLookup] = useState<{ userId: string; row: Staff | null } | null>(null)

  const userId = session?.user.id ?? null

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setSessionReady(true)
    })

    // Deliberately synchronous: awaiting Supabase calls inside this callback
    // can deadlock the auth lock, so the staff lookup lives in its own effect.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSessionReady(true)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Could not load the staff row for this account', error)
        }
        setLookup({ userId, row: data ?? null })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const resolved = lookup !== null && lookup.userId === userId ? lookup : null

  return {
    session,
    staff: resolved?.row ?? null,
    loading: !sessionReady || (userId !== null && resolved === null),
  }
}
