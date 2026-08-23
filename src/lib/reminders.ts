import { supabase } from './supabase'
import type { Database } from '../types/database'

type SetDueArgs = Database['public']['Functions']['set_reminder_due']['Args']

export type SendOutcome = 'sent' | 'failed'

/**
 * Replaces both bounds — it does not coalesce, so a blank field is sent as an
 * explicit null and clears that bound. Clearing both raises, since a reminder
 * needs at least one.
 *
 * The generated Args type models SQL `DEFAULT NULL` parameters as optional
 * rather than nullable, so the null has to be cast past it.
 */
export async function setReminderDue(
  reminderId: string,
  dueOdometer: number | null,
  dueDate: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_reminder_due', {
    p_reminder_id: reminderId,
    p_due_odometer: dueOdometer,
    p_due_date: dueDate,
  } as unknown as SetDueArgs)

  return { error: error?.message ?? null }
}

/**
 * Records one contact attempt. A trigger closes the reminder when the attempt
 * succeeded; a failure leaves it pending so it can be retried. The app never
 * writes the reminder's status itself.
 */
export async function logReminderSend(
  reminderId: string,
  status: SendOutcome,
  channel: string,
  reason?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('log_reminder_send', {
    p_reminder_id: reminderId,
    p_status: status,
    p_channel: channel,
    ...(reason ? { p_error_detail: reason } : {}),
  })

  return { error: error?.message ?? null }
}
