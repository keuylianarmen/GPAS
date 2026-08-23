import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabaseAnonKey && 'VITE_SUPABASE_ANON_KEY',
  ].filter(Boolean)

  throw new Error(
    `Supabase is not configured. Missing ${missing.join(' and ')} in the environment. ` +
      `Add ${missing.length > 1 ? 'these keys' : 'this key'} to .env.local at the project root, ` +
      `then restart the dev server (Vite only reads env files at startup).`,
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
