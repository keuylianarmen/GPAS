import type { Database } from '../types/database'
import type { StringKey } from './i18n'

export type ContactHealth =
  Database['public']['Views']['v_customer_contact_health']['Row']

export type ContactProblem = 'failed' | 'no-phone' | 'no-opt-in'

export const CONTACT_PROBLEM_LABELS: Record<ContactProblem, StringKey> = {
  failed: 'contact.failed',
  'no-phone': 'contact.noPhone',
  'no-opt-in': 'contact.noOptIn',
}

/**
 * The single most pressing reason a customer cannot be reached. A failed
 * attempt outranks the rest: it is a problem to fix, not a standing state.
 *
 * Deliberately does not report 'no-opt-in'. Every card and the detail panel
 * already show consent as a pill, unconditionally and in both states, so a
 * band saying the same thing in the same amber inches below it was the one
 * case where the two genuinely duplicated. The band now fires only when
 * something more urgent than missing consent is wrong.
 *
 * 'no-opt-in' stays in ContactProblem and in the label map: the Dashboard
 * counts that state from the view directly and labels its tile from there.
 */
export function contactProblem(
  health: ContactHealth | undefined,
): ContactProblem | null {
  if (!health) return null
  if (health.last_attempt_failed === true) return 'failed'
  if (health.no_phone === true) return 'no-phone'
  return null
}

/** '' is no filter at all, which is the default. */
export type ContactFilter = '' | 'can-message' | 'no-opt-in' | 'no-phone' | 'failed'

/**
 * The call list, as questions rather than categories.
 *
 * The view reports each condition on its own, so a customer can be several at
 * once — no phone and no opt-in both. "Can be messaged" is therefore not one
 * column but two together: a number to send to, and consent to send.
 *
 * Labels are the contact.* strings the warning bands already use, so filtering
 * by a state reads as the same phrase the card showed.
 */
export const CONTACT_FILTERS: { value: ContactFilter; labelKey: StringKey }[] = [
  { value: '', labelKey: 'customers.anyContact' },
  { value: 'can-message', labelKey: 'customers.canMessage' },
  { value: 'no-opt-in', labelKey: 'contact.noOptIn' },
  { value: 'no-phone', labelKey: 'contact.noPhone' },
  { value: 'failed', labelKey: 'contact.failed' },
]

export function matchesContactFilter(
  health: ContactHealth | undefined,
  filter: ContactFilter,
): boolean {
  if (!filter) return true
  // No row means the view knows nothing about them, which is not evidence of
  // any particular state — so they match no filter rather than all of them.
  if (!health) return false

  switch (filter) {
    case 'can-message':
      return health.no_phone === false && health.no_opt_in === false
    case 'no-opt-in':
      return health.no_opt_in === true
    case 'no-phone':
      return health.no_phone === true
    case 'failed':
      return health.last_attempt_failed === true
  }
}
