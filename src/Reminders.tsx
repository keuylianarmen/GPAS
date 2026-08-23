import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km } from './lib/format'
import { addDays, todayIso } from './lib/date'
import { customerLabel } from './lib/customer'
import { vehicleLabel } from './lib/vehicle'
import { parseOptionalPositiveInteger } from './lib/parse'
import { logReminderSend, setReminderDue } from './lib/reminders'

type LiveReminder = Database['public']['Views']['v_reminders_live']['Row']

/** Rows rendered in the lookahead before it is truncated; the count is exact. */
const UPCOMING_SHOWN = 100

type Bucket = 'overdue' | 'this-week' | 'next-week'

const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: 'Overdue',
  'this-week': 'This week',
  'next-week': 'Next week',
}

/**
 * Passing the distance makes a reminder overdue even when its date is still
 * ahead. odometer_reached comes from the view; the date half stays a plain
 * comparison so "due today" reads as due rather than late.
 */
function isPassed(row: LiveReminder, today: string): boolean {
  if (row.odometer_reached === true) return true
  return row.due_date !== null && row.due_date < today
}

function bucketOf(row: LiveReminder, today: string): Bucket {
  if (isPassed(row, today)) return 'overdue'
  if (row.due_date !== null) {
    return row.due_date <= addDays(today, 7) ? 'this-week' : 'next-week'
  }
  // Distance-only service with no date. The due bucket only holds imminent
  // ones, so treat it as near rather than filing it under next week.
  return 'this-week'
}

/** Odometer-driven reminders read better as a reading than as a date. */
function dueText(row: LiveReminder): string {
  if (row.due_odometer !== null && row.triggered_by === 'odometer') {
    const now =
      row.current_odometer === null ? '' : `, now at ${km(row.current_odometer)}`
    return `Due at ${km(row.due_odometer)} km${now}`
  }
  if (row.due_date !== null) return `Due ${row.due_date}`
  if (row.due_odometer !== null) return `Due at ${km(row.due_odometer)} km`
  return 'No due point set'
}

function compareDue(a: LiveReminder, b: LiveReminder): number {
  return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
}

export default function Reminders() {
  const [rows, setRows] = useState<LiveReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [working, setWorking] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [failingId, setFailingId] = useState<string | null>(null)

  const today = todayIso()

  useEffect(() => {
    let cancelled = false

    // One view holds every pending, non-muted reminder, already split into
    // due and upcoming.
    supabase
      .from('v_reminders_live')
      .select('*')
      .then(({ data, error: loadError }) => {
        if (cancelled) return
        if (loadError) setError(loadError.message)
        else setRows(data ?? [])
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const grouped = useMemo(() => {
    const groups: Record<Bucket, LiveReminder[]> = {
      overdue: [],
      'this-week': [],
      'next-week': [],
    }
    for (const row of rows) {
      if (!row.id || row.bucket !== 'due') continue
      groups[bucketOf(row, today)].push(row)
    }
    for (const bucket of Object.values(groups)) bucket.sort(compareDue)
    return groups
  }, [rows, today])

  const upcoming = useMemo(
    () =>
      rows.filter((row) => row.id && row.bucket === 'upcoming').sort(compareDue),
    [rows],
  )

  /**
   * Both outcomes are recorded as contact attempts. A trigger closes the
   * reminder on success; a failure leaves it pending for a retry.
   */
  async function recordAttempt(id: string, outcome: 'sent' | 'failed', reason?: string) {
    setWorking(id)
    const { error: sendError } = await logReminderSend(id, outcome, 'phone', reason)
    setWorking(null)

    if (sendError) {
      setError(sendError)
      return
    }

    setFailingId(null)

    if (outcome === 'sent') {
      // Closed by the trigger, so it leaves the view.
      setRows((current) => current.filter((row) => row.id !== id))
      return
    }

    // Still pending, but the send log changed — reload to reflect it.
    setReloadToken((token) => token + 1)
  }

  /** Dismissing is a status change, not a contact attempt. */
  async function dismiss(id: string) {
    setWorking(id)
    const { error: updateError } = await supabase
      .from('reminders')
      .update({ status: 'cancelled' })
      .eq('id', id)
    setWorking(null)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setRows((current) => current.filter((row) => row.id !== id))
  }

  /**
   * Due points go through set_reminder_due so the paired job line is kept in
   * step; the app never updates a reminder's due columns directly.
   */
  async function saveDue(id: string, dueKm: string, dueDate: string) {
    const parsedKm = parseOptionalPositiveInteger(dueKm)
    if (parsedKm === 'invalid') {
      setError('Distance must be a whole number above zero, or left blank.')
      return
    }
    if (parsedKm === null && !dueDate) {
      setError('Give the reminder a distance, a date, or both.')
      return
    }

    setError(null)
    setWorking(id)

    const { error: rpcError } = await setReminderDue(id, parsedKm, dueDate || null)

    setWorking(null)

    if (rpcError) {
      setError(rpcError)
      return
    }

    // The change can move a reminder between buckets, and a trigger writes it
    // back to the job line, so reload rather than patching state.
    setEditingId(null)
    setReloadToken((token) => token + 1)
  }

  if (loading) return <p className="muted">Loading reminders…</p>

  const dueCount = Object.values(grouped).reduce((sum, list) => sum + list.length, 0)

  return (
    <>
      {error && (
        <div className="card notice">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setError(null)
              setLoading(true)
              setReloadToken((token) => token + 1)
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div className="section-label">
        <span>Due now</span>
        <span className="muted">
          <span className="num">{dueCount}</span>{' '}
          {dueCount === 1 ? 'reminder' : 'reminders'}
        </span>
      </div>

      {dueCount === 0 && <p className="empty">Nothing due right now.</p>}

      {(Object.keys(BUCKET_LABELS) as Bucket[]).map((bucket) => {
        const list = grouped[bucket]
        if (list.length === 0) return null

        return (
          <section className="reminder-group" key={bucket}>
            <h2 className={`reminder-group-head reminder-group-head--${bucket}`}>
              {BUCKET_LABELS[bucket]}
              <span className="num">{list.length}</span>
            </h2>

            {list.map((row) => (
              <ReminderCard
                key={row.id}
                row={row}
                busy={working === row.id}
                editing={editingId === row.id}
                onEdit={() => setEditingId(row.id ?? null)}
                onCancelEdit={() => setEditingId(null)}
                onSaveDue={(dueKm, dueDate) =>
                  row.id && saveDue(row.id, dueKm, dueDate)
                }
                failing={failingId === row.id}
                onSent={() => row.id && recordAttempt(row.id, 'sent')}
                onStartFail={() => setFailingId(row.id ?? null)}
                onCancelFail={() => setFailingId(null)}
                onFailed={(reason) => row.id && recordAttempt(row.id, 'failed', reason)}
                onDismiss={() => row.id && dismiss(row.id)}
              />
            ))}
          </section>
        )
      })}

      <div className="section-label reminder-later-head">
        <span>Reminders further out</span>
        <span className="muted">
          <span className="num">{upcoming.length}</span> pending
        </span>
      </div>

      {upcoming.length === 0 ? (
        <p className="empty">Nothing else pending.</p>
      ) : (
        upcoming.slice(0, UPCOMING_SHOWN).map((row) => (
          <ReminderCard
            key={row.id}
            row={row}
            later
            busy={working === row.id}
            editing={editingId === row.id}
            onEdit={() => setEditingId(row.id ?? null)}
            onCancelEdit={() => setEditingId(null)}
            onSaveDue={(dueKm, dueDate) => row.id && saveDue(row.id, dueKm, dueDate)}
          />
        ))
      )}

      {upcoming.length > UPCOMING_SHOWN && (
        <p className="field-note">
          Showing the first {UPCOMING_SHOWN} of {upcoming.length}.
        </p>
      )}
    </>
  )
}

function ReminderCard({
  row,
  busy,
  editing,
  failing = false,
  later = false,
  onEdit,
  onCancelEdit,
  onSaveDue,
  onSent,
  onStartFail,
  onCancelFail,
  onFailed,
  onDismiss,
}: {
  row: LiveReminder
  busy: boolean
  editing: boolean
  failing?: boolean
  /** Lookahead rows can have their due point adjusted but not be contacted yet. */
  later?: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaveDue: (dueKm: string, dueDate: string) => void
  onSent?: () => void
  onStartFail?: () => void
  onCancelFail?: () => void
  onFailed?: (reason: string) => void
  onDismiss?: () => void
}) {
  const [dueKm, setDueKm] = useState(
    row.due_odometer === null ? '' : String(row.due_odometer),
  )
  const [dueDate, setDueDate] = useState(row.due_date ?? '')
  const [reason, setReason] = useState('')

  return (
    <div className={later ? 'card reminder reminder--later' : 'card reminder'}>
      <div className="reminder-main">
        <div className="reminder-service">{row.service_en ?? 'Unknown service'}</div>
        <div className="reminder-who">
          <span dir="auto">{customerLabel(row)}</span>
          {' · '}
          <span className="num">{vehicleLabel(row)}</span>
          {row.phone ? (
            <>
              {' · '}
              <span className="num">{row.phone}</span>
            </>
          ) : null}
        </div>

        {editing ? (
          <div className="reminder-edit">
            <div className="grid-2">
              <label className="field">
                <span>
                  Due at <span className="field-hint">km</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={dueKm}
                  onChange={(event) => setDueKm(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>Due by</span>
                <input
                  className="num"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <p className="field-note">
              Saving updates the job line this reminder came from.
            </p>
            <div className="confirm-row">
              <button
                type="button"
                className="btn btn--dark btn--small"
                disabled={busy}
                onClick={() => onSaveDue(dueKm, dueDate)}
              >
                {busy ? 'Saving…' : 'Save due point'}
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={busy}
                onClick={onCancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="reminder-due num">{dueText(row)}</div>
        )}

        {failing && onFailed && (
          <div className="reminder-edit">
            <label className="field">
              <span>
                What happened <span className="field-hint">optional</span>
              </span>
              <input
                dir="auto"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="No answer"
                disabled={busy}
              />
            </label>
            <p className="field-note">
              The reminder stays pending, so it can be tried again.
            </p>
            <div className="confirm-row">
              <button
                type="button"
                className="btn btn--dark btn--small"
                disabled={busy}
                onClick={() => onFailed(reason.trim())}
              >
                {busy ? 'Saving…' : 'Log the attempt'}
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={busy}
                onClick={onCancelFail}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {row.whatsapp_opt_in === false && (
          <p className="reminder-flag">
            No WhatsApp opt-in, so this cannot go out by message. Phone them, then
            mark it sent.
          </p>
        )}
      </div>

      {!editing && !failing && (
        <div className="reminder-actions">
          {onSent && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy}
              onClick={onSent}
            >
              Mark sent
            </button>
          )}
          {onStartFail && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={busy}
              onClick={onStartFail}
            >
              Couldn&rsquo;t reach
            </button>
          )}
          <button
            type="button"
            className="btn btn--quiet btn--small"
            disabled={busy}
            onClick={onEdit}
          >
            Edit due
          </button>
          {onDismiss && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={busy}
              onClick={onDismiss}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
