import type { Database } from '../types/database'
import { supabase } from './supabase'
import { t } from './i18n'

type Job = Database['public']['Tables']['jobs']['Row']
type JobUpdate = Database['public']['Tables']['jobs']['Update']
type JobItemInsert = Database['public']['Tables']['job_items']['Insert']
type JobItemUpdate = Database['public']['Tables']['job_items']['Update']
type JobItem = Database['public']['Tables']['job_items']['Row']

/**
 * A job exists from the moment there is a customer to attach it to.
 *
 * Everything here writes to a row that is already on the counter's screen, so
 * every call returns either the new row or a message — never throws, and never
 * leaves the caller guessing which happened. A failure mid-entry must be
 * something the person can see and retry, not something that silently drops
 * the work they are in the middle of.
 */

/** The row a customer selection creates. Status comes from the column default. */
export async function createOpenJob(
  customerId: string,
): Promise<Job | { error: string }> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({ customer_id: customerId, status: 'open' })
    .select()
    .single()

  if (error || !data) return { error: error?.message ?? t('openJob.createFailed') }
  return data
}

/** Any field of the open job. Returns the refreshed row so state stays true. */
export async function patchJob(
  jobId: string,
  patch: JobUpdate,
): Promise<Job | { error: string }> {
  const { data, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', jobId)
    .select()
    .single()

  if (error || !data) return { error: error?.message ?? t('openJob.saveFailed') }
  return data
}

/**
 * A line becomes a row the moment a service is chosen for it.
 *
 * 'open', so `trg_create_reminder` stays quiet: the line is a record of what
 * someone typed, not a claim that the work happened. Every column is named
 * even where it is null — postgrest builds its column list from the keys
 * present, and this shape has to match the one `completeJob` writes.
 */
export async function createLine(
  jobId: string,
  serviceId: string,
  fields: Omit<JobItemInsert, 'job_id' | 'service_id' | 'status'>,
): Promise<JobItem | { error: string }> {
  const { data, error } = await supabase
    .from('job_items')
    .insert({ ...fields, job_id: jobId, service_id: serviceId, status: 'open' })
    .select()
    .single()

  if (error || !data) return { error: error?.message ?? t('openJob.lineFailed') }
  return data
}

/** Never writes `status` — only the two completion paths move a line's state. */
export async function patchLine(
  lineId: string,
  patch: Omit<JobItemUpdate, 'status'>,
): Promise<string | null> {
  const { error } = await supabase.from('job_items').update(patch).eq('id', lineId)
  return error ? error.message : null
}

export async function deleteLine(lineId: string): Promise<string | null> {
  const { error } = await supabase.from('job_items').delete().eq('id', lineId)
  return error ? error.message : null
}

/**
 * The final action. Two writes, in this order, and the order is the point.
 *
 * The lines go to 'done' first. That is what fires `trg_create_reminder`, once
 * per line, which is the entire reason the app can hold a job open without
 * fabricating reminders for work nobody has performed yet. Only then does the
 * job itself read 'completed'.
 *
 * Doing it the other way round would leave a window where the job claims to be
 * finished while its lines still say otherwise — and if the second write
 * failed, a completed job with no revenue and no reminders, which reads as a
 * free service rather than as an error.
 *
 * If the line flip fails, the job stays open and is resumable. That is the
 * recoverable half; a completed job whose reminders never fired is not.
 */
export async function completeJob(
  jobId: string,
  patch: JobUpdate,
): Promise<Job | { error: string }> {
  const { error: lineError } = await supabase
    .from('job_items')
    .update({ status: 'done' })
    .eq('job_id', jobId)
    .eq('status', 'open')

  if (lineError) return { error: lineError.message }

  return patchJob(jobId, { ...patch, status: 'completed' })
}

/**
 * Abandoned rather than deleted. What somebody typed at the counter is a
 * record even when the job did not happen, and a `job_no` is spent either way.
 *
 * The lines stay 'open', so nothing about a cancelled job has ever claimed to
 * be work: no reminder was created to cancel, and every view added in 27
 * requires 'completed'.
 */
export async function cancelJob(jobId: string): Promise<string | null> {
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)

  return error ? error.message : null
}
