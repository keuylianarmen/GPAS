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
 * Discards an open job outright — the row and, by cascade, its lines.
 *
 * One statement, deliberately. Deleting the lines first and the job second
 * would work whether or not the foreign key cascades, at the cost of a window
 * where a failure leaves a job with its lines gone: a row that says a visit
 * happened and can no longer say what was done. Deleting only the job has no
 * such window. It either takes the lines with it or fails having changed
 * nothing, and both are states somebody can act on.
 *
 * `status = 'open'` is part of the statement rather than a check before it.
 * That is the whole safety property: this cannot remove a completed job even
 * if it is handed one's id, because the row it would have to match does not
 * match. Twenty-two jobs of imported history sit behind that filter and there
 * is no undo anywhere in this app.
 *
 * A delete that matches nothing is reported rather than passed off as
 * success — it means the job was finished or removed by someone else, which
 * the person looking at a stale list needs to hear.
 */
export async function deleteOpenJob(jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', jobId)
    .eq('status', 'open')
    .select('id')

  if (error) return error.message
  if (!data || data.length === 0) return t('openJob.deleteRefused')
  return null
}
