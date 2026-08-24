import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km } from './lib/format'
import { addDays, todayIso } from './lib/date'
import { customerLabel } from './lib/customer'
import { vehicleLabel } from './lib/vehicle'
import { parseOptionalPositiveInteger } from './lib/parse'
import { logReminderSend, setReminderDue } from './lib/reminders'
import Collapsible from './components/Collapsible'
import { localised, t, tn } from './lib/i18n'
import type { StringKey } from './lib/i18n'

type LiveReminder = Database['public']['Views']['v_reminders_live']['Row']
type DismissedReminder = Database['public']['Views']['v_reminders_dismissed']['Row']

/** Both views carry the same due information; only the live one is bucketed. */
type DueFields = {
  triggered_by?: string | null
  due_date: string | null
  due_odometer: number | null
  current_odometer: number | null
}

/** A misclick is the common case, so the row lingers before it goes. */
const UNDO_WINDOW_MS = 6000

/** Rows rendered in the lookahead before it is truncated; the count is exact. */
const UPCOMING_SHOWN = 100

type Bucket = 'overdue' | 'this-week' | 'next-week'

/** The three due buckets, plus the lookahead and the dismissed list. */
type Filter = 'overdue' | 'this-week' | 'next-week' | 'later' | 'dismissed'

const FILTER_LABELS: Record<Filter, StringKey> = {
  overdue: 'reminders.overdue',
  'this-week': 'reminders.thisWeek',
  'next-week': 'reminders.nextWeek',
  later: 'reminders.later',
  dismissed: 'reminders.dismissed',
}

const BUCKET_LABELS: Record<Bucket, StringKey> = {
  overdue: 'reminders.overdue',
  'this-week': 'reminders.thisWeek',
  'next-week': 'reminders.nextWeek',
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
function dueText(row: DueFields): string {
  if (row.due_odometer !== null && row.triggered_by === 'odometer') {
    return row.current_odometer === null
      ? t('reminders.dueAt', { km: km(row.due_odometer) })
      : t('reminders.dueAtNow', {
          km: km(row.due_odometer),
          current: km(row.current_odometer),
        })
  }
  if (row.due_date !== null) return t('reminders.dueOn', { date: row.due_date })
  if (row.due_odometer !== null)
    return t('reminders.dueAt', { km: km(row.due_odometer) })
  return t('reminders.noDuePoint')
}

function compareDue(a: LiveReminder, b: LiveReminder): number {
  return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31')
}

export default function Reminders() {
  const [rows, setRows] = useState<LiveReminder[]>([])
  const [dismissed, setDismissed] = useState<DismissedReminder[]>([])
  const [showDismissed, setShowDismissed] = useState(false)
  // Empty means "All"; several at once is the point — overdue plus this week
  // is the daily working set.
  const [filters, setFilters] = useState<Set<Filter>>(new Set())
  const [justDismissed, setJustDismissed] = useState<Set<string>>(new Set())
  const undoTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [working, setWorking] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [failingId, setFailingId] = useState<string | null>(null)

  const today = todayIso()

  useEffect(() => {
    let cancelled = false

    async function load() {
      // One view holds every pending, non-muted reminder, already split into
      // due and upcoming. The other holds hand-cancelled ones with no live
      // replacement — superseded reminders are excluded by the view.
      const [liveResult, dismissedResult] = await Promise.all([
        supabase.from('v_reminders_live').select('*'),
        supabase.from('v_reminders_dismissed').select('*'),
      ])

      if (cancelled) return

      const failure = liveResult.error ?? dismissedResult.error
      if (failure) setError(failure.message)
      else {
        setRows(liveResult.data ?? [])
        setDismissed(dismissedResult.data ?? [])
      }
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    const timers = undoTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

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

  /**
   * Dismissing is a status change, not a contact attempt. The write happens
   * straight away — closing the tab must not silently undo it — but the row
   * stays put briefly so a misclick can be taken back without hunting through
   * the dismissed section.
   */
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

    setJustDismissed((current) => new Set(current).add(id))

    undoTimers.current.set(
      id,
      setTimeout(() => {
        undoTimers.current.delete(id)
        setJustDismissed((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        // Reload rather than splice: the row now belongs to the other list.
        setReloadToken((token) => token + 1)
      }, UNDO_WINDOW_MS),
    )
  }

  async function restore(id: string) {
    const timer = undoTimers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      undoTimers.current.delete(id)
    }

    setWorking(id)
    const { error: updateError } = await supabase
      .from('reminders')
      .update({ status: 'pending' })
      .eq('id', id)
    setWorking(null)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setJustDismissed((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setReloadToken((token) => token + 1)
  }

  /**
   * Due points go through set_reminder_due so the paired job line is kept in
   * step; the app never updates a reminder's due columns directly.
   */
  async function saveDue(id: string, dueKm: string, dueDate: string) {
    const parsedKm = parseOptionalPositiveInteger(dueKm)
    if (parsedKm === 'invalid') {
      setError(t('reminders.badDistance'))
      return
    }
    if (parsedKm === null && !dueDate) {
      setError(t('reminders.needDuePoint'))
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

  if (loading) return <p className="muted">{t('reminders.loading')}</p>

  const counts: Record<Filter, number> = {
    overdue: grouped.overdue.length,
    'this-week': grouped['this-week'].length,
    'next-week': grouped['next-week'].length,
    later: upcoming.length,
    dismissed: dismissed.length,
  }
  const totalCount = Object.values(counts).reduce((sum, value) => sum + value, 0)

  const showingAll = filters.size === 0
  const shows = (filter: Filter) => showingAll || filters.has(filter)

  const visibleDueCount =
    (shows('overdue') ? counts.overdue : 0) +
    (shows('this-week') ? counts['this-week'] : 0) +
    (shows('next-week') ? counts['next-week'] : 0)
  const anyDueSectionShown =
    shows('overdue') || shows('this-week') || shows('next-week')

  function toggleFilter(filter: Filter) {
    setFilters((current) => {
      const next = new Set(current)
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)

      // Dismissed opens when it is the only thing being looked at.
      if (next.size === 1 && next.has('dismissed')) setShowDismissed(true)
      return next
    })
  }

  function selectAll() {
    setFilters(new Set())
    setShowDismissed(false)
  }

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
            {t('action.tryAgain')}
          </button>
        </div>
      )}

      {/* Counts are worth seeing even when nobody filters, so they are always
          rendered — zero included. */}
      <div className="filter-bar">
        <div className="chips" role="group" aria-label={t('reminders.filterLabel')}>
          <button
            type="button"
            className="chip"
            aria-pressed={showingAll}
            onClick={selectAll}
          >
            {t('reminders.all')} <span className="num">{totalCount}</span>
          </button>
          {(Object.keys(FILTER_LABELS) as Filter[]).map((filter) => (
            <button
              type="button"
              key={filter}
              className="chip"
              aria-pressed={filters.has(filter)}
              onClick={() => toggleFilter(filter)}
            >
              {t(FILTER_LABELS[filter])}{' '}
              <span className="num">{counts[filter]}</span>
            </button>
          ))}
        </div>
      </div>

      {anyDueSectionShown && (
        <div className="section-label">
          <span>{t('reminders.dueNow')}</span>
          <span className="muted">
            {tn(visibleDueCount, 'reminders.dueCount')}
          </span>
        </div>
      )}

      {anyDueSectionShown && visibleDueCount === 0 && (
        <p className="empty">{t('reminders.nothingDue')}</p>
      )}

      {(Object.keys(BUCKET_LABELS) as Bucket[]).map((bucket) => {
        const list = grouped[bucket]
        if (list.length === 0 || !shows(bucket)) return null

        return (
          <section className="reminder-group" key={bucket}>
            <h2 className={`reminder-group-head reminder-group-head--${bucket}`}>
              {t(BUCKET_LABELS[bucket])}
              <span className="num">{list.length}</span>
            </h2>

            {list.map((row) => (
              <ReminderCard
                key={row.id}
                row={row}
                busy={working === row.id}
                dismissed={row.id !== null && justDismissed.has(row.id)}
                onUndo={() => row.id && restore(row.id)}
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

      {shows('later') && (
      <div className="section-label reminder-later-head">
        <span>{t('reminders.furtherOut')}</span>
        <span className="muted">
          <span className="num">{upcoming.length}</span>{' '}
          {t('reminders.pending')}
        </span>
      </div>
      )}

      {shows('later') && (upcoming.length === 0 ? (
        <p className="empty">{t('reminders.nothingElse')}</p>
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
      ))}

      {shows('later') && upcoming.length > UPCOMING_SHOWN && (
        <p className="field-note">
          {t('reminders.showingFirst', {
            shown: UPCOMING_SHOWN,
            total: upcoming.length,
          })}
        </p>
      )}

      {shows('dismissed') && (
      <div className="section-label reminder-later-head">
        <button
          type="button"
          className="disclosure"
          aria-expanded={showDismissed}
          onClick={() => setShowDismissed((open) => !open)}
        >
          <span className="disclosure-mark">{showDismissed ? '−' : '+'}</span>
          {t('reminders.dismissed')}
          <span className="muted num">{dismissed.length}</span>
        </button>
      </div>
      )}

      {shows('dismissed') && (
      <Collapsible open={showDismissed}>
        <p className="field-note">
          {t('reminders.dismissedNote')}
        </p>

        {dismissed.length === 0 ? (
          <p className="empty">{t('reminders.nothingDismissed')}</p>
        ) : (
          dismissed.map((row) => (
            <div className="card reminder reminder--later" key={row.id}>
              <div className="reminder-main">
                <div className="reminder-service">
                  {localised(row.service_en, row.service_ar) ??
                    t('reminders.unknownService')}
                </div>
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
                <div className="reminder-due figures" dir="auto">
          {dueText(row)}
        </div>
              </div>

              <div className="reminder-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  disabled={working === row.id}
                  onClick={() => row.id && restore(row.id)}
                >
                  {t('reminders.restore')}
                </button>
              </div>
            </div>
          ))
        )}
      </Collapsible>
      )}
    </>
  )
}

function ReminderCard({
  row,
  busy,
  editing,
  dismissed = false,
  onUndo,
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
  /** Cancelled, but still on screen for the length of the undo window. */
  dismissed?: boolean
  onUndo?: () => void
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

  const className = ['card', 'reminder']
  if (later) className.push('reminder--later')
  if (dismissed) className.push('reminder--dismissed')

  return (
    <div className={className.join(' ')}>
      <div className="reminder-main">
        <div className="reminder-service">{localised(row.service_en, row.service_ar) ??
                    t('reminders.unknownService')}</div>
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
                  {t('reminders.dueAtLabel')}{' '}
                  <span className="field-hint">{t('common.km')}</span>
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
                <span>{t('reminders.dueByLabel')}</span>
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
              {t('reminders.dueEditNote')}
            </p>
            <div className="confirm-row">
              <button
                type="button"
                className="btn btn--dark btn--small"
                disabled={busy}
                onClick={() => onSaveDue(dueKm, dueDate)}
              >
                {busy ? t('action.saving') : t('reminders.saveDue')}
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={busy}
                onClick={onCancelEdit}
              >
                {t('action.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="reminder-due figures" dir="auto">
          {dueText(row)}
        </div>
        )}

        {failing && onFailed && (
          <div className="reminder-edit">
            <label className="field">
              <span>
                {t('reminders.whatHappened')}{' '}
                <span className="field-hint">{t('common.optional')}</span>
              </span>
              <input
                dir="auto"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('reminders.whatHappenedPlaceholder')}
                disabled={busy}
              />
            </label>
            <p className="field-note">
              {t('reminders.failNote')}
            </p>
            <div className="confirm-row">
              <button
                type="button"
                className="btn btn--dark btn--small"
                disabled={busy}
                onClick={() => onFailed(reason.trim())}
              >
                {busy ? t('action.saving') : t('reminders.logAttempt')}
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={busy}
                onClick={onCancelFail}
              >
                {t('action.cancel')}
              </button>
            </div>
          </div>
        )}

        {row.whatsapp_opt_in === false && (
          <p className="reminder-flag">
            {t('reminders.cannotMessage')}
          </p>
        )}
      </div>

      {dismissed && onUndo && (
        <div className="reminder-actions">
          <span className="muted">{t('reminders.dismissedState')}</span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={busy}
            onClick={onUndo}
          >
            {t('reminders.undo')}
          </button>
        </div>
      )}

      {!editing && !failing && !dismissed && (
        <div className="reminder-actions">
          {onSent && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              disabled={busy}
              onClick={onSent}
            >
              {t('reminders.markSent')}
            </button>
          )}
          {onStartFail && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={busy}
              onClick={onStartFail}
            >
              {t('reminders.couldntReach')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--quiet btn--small"
            disabled={busy}
            onClick={onEdit}
          >
            {t('reminders.editDue')}
          </button>
          {onDismiss && (
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={busy}
              onClick={onDismiss}
            >
              {t('reminders.dismiss')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
