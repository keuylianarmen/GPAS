import { useEffect, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { money } from './lib/format'
import { todayIso } from './lib/date'
import { customerLabel } from './lib/customer'
import { jobVehicleLabel } from './lib/vehicle'
import { localised, t, tn } from './lib/i18n'
import { CONTACT_PROBLEM_LABELS } from './lib/contactHealth'

type LiveReminder = Database['public']['Views']['v_reminders_live']['Row']

type RecentJob = {
  id: string
  job_no: number
  start_date: string
  payment_method: string | null
  vehicle_id: string | null
  customers: { name_en: string | null; name_ar: string | null } | null
  vehicles: { plate: string | null; make: string | null; model: string | null } | null
  job_items: { services: { name_en: string; name_ar: string | null } | null }[]
}

type Counts = {
  jobsToday: number
  jobsOpen: number
  revenueThisMonth: number
  customers: number
  failed: number
  noPhone: number
  noOptIn: number
}

const EMPTY_COUNTS: Counts = {
  jobsToday: 0,
  jobsOpen: 0,
  revenueThisMonth: 0,
  customers: 0,
  failed: 0,
  noPhone: 0,
  noOptIn: 0,
}

function monthBounds(today: string): { start: string; end: string } {
  const [year, month] = today.split('-').map(Number)
  const start = `${today.slice(0, 7)}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start, end: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}` }
}

export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (tab: 'jobs' | 'customers' | 'reminders') => void
}) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([])
  const [jobTotals, setJobTotals] = useState<Map<string, number | null>>(new Map())
  const [dueReminders, setDueReminders] = useState<LiveReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = todayIso()

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { start, end } = monthBounds(today)

      const [
        jobsTodayResult,
        jobsOpenResult,
        revenueResult,
        customerResult,
        recentResult,
        reminderResult,
        failedResult,
        noPhoneResult,
        noOptInResult,
      ] = await Promise.all([
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('start_date', today)
          .eq('status', 'completed'),
        // Counted alongside rather than filtered away. Two cars on the ramps
        // and a tile reading zero is worse than the miscount that filtering
        // fixed — today is the one day an open job is real work. Not scoped to
        // today's date: a car that came in yesterday and is still on a ramp is
        // in progress now, and this number matching the Jobs screen's section
        // matters more than agreeing with the label's word for word.
        supabase
          .from('jobs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        // Revenue comes from the totals view; it is never stored on the job.
        supabase
          .from('v_job_totals')
          .select('total_with_tax')
          .eq('status', 'completed')
          .gte('start_date', start)
          .lte('start_date', end),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase
          .from('jobs')
          .select(
            'id, job_no, start_date, payment_method, vehicle_id, customers(name_en, name_ar), vehicles(plate, make, model), job_items(services(name_en, name_ar))',
          )
          .eq('status', 'completed')
          .order('start_date', { ascending: false })
          .order('job_no', { ascending: false })
          .limit(5),
        supabase.from('v_reminders_live').select('*').eq('bucket', 'due'),
        supabase
          .from('v_customer_contact_health')
          .select('customer_id', { count: 'exact', head: true })
          .is('last_attempt_failed', true),
        supabase
          .from('v_customer_contact_health')
          .select('customer_id', { count: 'exact', head: true })
          .is('no_phone', true),
        supabase
          .from('v_customer_contact_health')
          .select('customer_id', { count: 'exact', head: true })
          .is('no_opt_in', true),
      ])

      if (cancelled) return

      const failure =
        jobsTodayResult.error ??
        jobsOpenResult.error ??
        revenueResult.error ??
        customerResult.error ??
        recentResult.error ??
        reminderResult.error ??
        failedResult.error ??
        noPhoneResult.error ??
        noOptInResult.error

      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      setCounts({
        jobsToday: jobsTodayResult.count ?? 0,
        jobsOpen: jobsOpenResult.count ?? 0,
        revenueThisMonth: (revenueResult.data ?? []).reduce(
          (sum, row) => sum + (row.total_with_tax ?? 0),
          0,
        ),
        customers: customerResult.count ?? 0,
        failed: failedResult.count ?? 0,
        noPhone: noPhoneResult.count ?? 0,
        noOptIn: noOptInResult.count ?? 0,
      })

      const jobs = recentResult.data ?? []
      setRecentJobs(jobs)
      setDueReminders(reminderResult.data ?? [])

      if (jobs.length > 0) {
        const { data: totals } = await supabase
          .from('v_job_totals')
          .select('job_id, total_with_tax')
          .in(
            'job_id',
            jobs.map((job) => job.id),
          )

        if (cancelled) return
        setJobTotals(
          new Map(
            (totals ?? []).flatMap((row) =>
              row.job_id ? [[row.job_id, row.total_with_tax] as const] : [],
            ),
          ),
        )
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [today])

  if (loading) return <p className="muted">{t('app.loading')}</p>

  if (error) {
    return (
      <div className="card notice">
        <p>{t('dash.loadFailed')}</p>
        <p className="muted">{error}</p>
      </div>
    )
  }

  const contactFlags = [
    { key: 'failed', label: t(CONTACT_PROBLEM_LABELS.failed), value: counts.failed },
    {
      key: 'no-phone',
      label: t(CONTACT_PROBLEM_LABELS['no-phone']),
      value: counts.noPhone,
    },
    {
      key: 'no-opt-in',
      label: t(CONTACT_PROBLEM_LABELS['no-opt-in']),
      value: counts.noOptIn,
    },
  ] as const

  return (
    <>
      <div className="stat-grid">
        <div className="card stat">
          <div className="stat-label">{t('dash.jobsToday')}</div>
          <div className="stat-value num">{counts.jobsToday}</div>
          {/* Only when there is something in progress. A permanent "0 in
              progress" would be noise on every quiet afternoon. */}
          {counts.jobsOpen > 0 && (
            <div className="stat-sub figures" dir="auto">
              {tn(counts.jobsOpen, 'dash.jobsInProgress')}
            </div>
          )}
        </div>
        <div className="card stat">
          <div className="stat-label">{t('dash.revenueThisMonth')}</div>
          <div className="stat-value num">
            {money(counts.revenueThisMonth)}
            <span className="stat-unit">{t('common.currency')}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t('dash.remindersDue')}</div>
          <div className="stat-value num">{dueReminders.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t('dash.customers')}</div>
          <div className="stat-value num">{counts.customers}</div>
        </div>
      </div>

      <div className="dash-columns">
        <section>
          <div className="section-label">
            <span>{t('dash.recentJobs')}</span>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => onNavigate('jobs')}
            >
              {t('action.seeAll')}
            </button>
          </div>

          {recentJobs.length === 0 ? (
            <p className="empty">{t('dash.noJobs')}</p>
          ) : (
            recentJobs.map((job) => (
              <div className="card dash-row" key={job.id}>
                <div className="dash-row-main">
                  <div className="dash-row-title" dir="auto">
                    {job.customers
                      ? customerLabel(job.customers)
                      : t('dash.unknownCustomer')}
                  </div>
                  <div className="list-row-meta">
                    <span className="num">
                      {jobVehicleLabel(job.vehicle_id, job.vehicles)}
                    </span>
                    {' · '}
                    <span className="num">{job.start_date}</span>
                  </div>
                  <div className="list-row-meta">
                    {job.job_items
                      .flatMap((item) =>
                        item.services
                          ? [
                              localised(
                                item.services.name_en,
                                item.services.name_ar,
                              ) ?? '',
                            ]
                          : [],
                      )
                      .join(' · ') || t('dash.noLines')}
                  </div>
                </div>
                <div className="dash-row-side">
                  <div className="num list-row-amount">
                    {money(jobTotals.get(job.id) ?? null)}
                  </div>
                  {job.payment_method && (
                    <div className="list-row-meta">{job.payment_method}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        <section>
          <div className="section-label">
            <span>{t('dash.remindersDue')}</span>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => onNavigate('reminders')}
            >
              {t('action.seeAll')}
            </button>
          </div>

          {dueReminders.length === 0 ? (
            <p className="empty">{t('dash.nothingDue')}</p>
          ) : (
            dueReminders.slice(0, 5).map((row) => (
              <div className="card dash-row" key={row.id}>
                <div className="dash-row-main">
                  <div className="dash-row-title">
                    {localised(row.service_en, row.service_ar) ??
                      t('dash.unknownService')}
                  </div>
                  <div className="list-row-meta">
                    <span dir="auto">{customerLabel(row)}</span>
                    {' · '}
                    <span className="num">
                      {row.due_date ?? `${row.due_odometer ?? '—'} km`}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="section-label dash-health-head">
        <span>{t('dash.contactHealth')}</span>
      </div>
      <p className="field-note">{t('dash.contactHealthNote')}</p>

      <div className="stat-grid">
        {contactFlags.map((flag) => (
          <button
            type="button"
            className={`card stat stat--action flag--${flag.key}`}
            key={flag.key}
            onClick={() => onNavigate('customers')}
          >
            <div className="stat-label">{flag.label}</div>
            <div className="stat-value num">{flag.value}</div>
          </button>
        ))}
      </div>
    </>
  )
}
