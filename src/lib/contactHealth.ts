import type { Database } from '../types/database'

export type ContactHealth =
  Database['public']['Views']['v_customer_contact_health']['Row']

export type ContactProblem = 'failed' | 'no-phone' | 'no-opt-in'

export const CONTACT_PROBLEM_LABELS: Record<ContactProblem, string> = {
  failed: 'Last attempt failed',
  'no-phone': 'No phone number',
  'no-opt-in': 'No WhatsApp opt-in',
}

/**
 * The single most pressing reason a customer cannot be reached. A failed
 * attempt outranks the rest: it is a problem to fix, not a standing state.
 */
export function contactProblem(
  health: ContactHealth | undefined,
): ContactProblem | null {
  if (!health) return null
  if (health.last_attempt_failed === true) return 'failed'
  if (health.no_phone === true) return 'no-phone'
  if (health.no_opt_in === true) return 'no-opt-in'
  return null
}
