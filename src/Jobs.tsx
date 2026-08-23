import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { money } from './lib/format'
import { dueDefaults } from './lib/due'
import { customerLabel } from './lib/customer'
import { parseOptionalInteger, parseOptionalNumber } from './lib/parse'
import Dialog from './components/Dialog'

type Job = Database['public']['Tables']['jobs']['Row']
type JobItem = Database['public']['Tables']['job_items']['Row']
type Service = Database['public']['Tables']['services']['Row']
type Category = Database['public']['Tables']['service_categories']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type PaymentMethod = Database['public']['Tables']['lookup_values']['Row']
type Staff = Database['public']['Tables']['staff']['Row']

type JobRow = Job & {
  customers: { name_en: string | null; name_ar: string | null } | null
  vehicles: { plate: string | null } | null
  job_items: { count: number }[]
}

/** Guards an unbounded read; the list says so when it bites. */
const LIST_LIMIT = 200

/** updated_at stays null until the first edit, but tolerate it being stamped on insert. */
function editedOn(job: Job): string | null {
  if (!job.updated_at || job.updated_at === job.created_at) return null
  return job.updated_at.slice(0, 10)
}

export default function Jobs({ staff }: { staff: Staff }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [referenceReady, setReferenceReady] = useState(false)

  const [jobs, setJobs] = useState<JobRow[]>([])
  const [totals, setTotals] = useState<Map<string, number | null>>(new Map())
  const [jobsReady, setJobsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [customerFilter, setCustomerFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [openJob, setOpenJob] = useState<JobRow | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [customerResult, serviceResult, categoryResult, paymentResult] =
        await Promise.all([
          supabase.from('customers').select('*').order('created_at', { ascending: false }),
          supabase.from('services').select('*').eq('active', true).order('name_en'),
          supabase
            .from('service_categories')
            .select('*')
            .eq('active', true)
            .order('sort_order')
            .order('name_en'),
          supabase
            .from('lookup_values')
            .select('*')
            .eq('list_key', 'payment_method')
            .eq('active', true)
            .order('sort_order'),
        ])

      if (cancelled) return

      const failure =
        customerResult.error ??
        serviceResult.error ??
        categoryResult.error ??
        paymentResult.error

      if (failure) {
        setError(failure.message)
        setReferenceReady(true)
        return
      }

      setCustomers(customerResult.data ?? [])
      setServices(serviceResult.data ?? [])
      setCategories(categoryResult.data ?? [])
      setPaymentMethods(paymentResult.data ?? [])
      setReferenceReady(true)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      let query = supabase
        .from('jobs')
        .select('*, customers(name_en, name_ar), vehicles(plate), job_items(count)')
        .order('start_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)

      if (customerFilter) query = query.eq('customer_id', customerFilter)
      if (fromDate) query = query.gte('start_date', fromDate)
      if (toDate) query = query.lte('start_date', toDate)

      const { data, error: jobsError } = await query
      if (cancelled) return

      if (jobsError) {
        setError(jobsError.message)
        setJobsReady(true)
        return
      }

      const rows = data ?? []
      setJobs(rows)
      setError(null)

      // v_job_totals is the only source of a job's money.
      if (rows.length > 0) {
        const { data: totalRows, error: totalsError } = await supabase
          .from('v_job_totals')
          .select('job_id, total_with_tax')
          .in(
            'job_id',
            rows.map((row) => row.id),
          )

        if (cancelled) return
        if (totalsError) setError(totalsError.message)
        else {
          setTotals(
            new Map(
              (totalRows ?? []).flatMap((row) =>
                row.job_id ? [[row.job_id, row.total_with_tax] as const] : [],
              ),
            ),
          )
        }
      } else {
        setTotals(new Map())
      }

      setJobsReady(true)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [customerFilter, fromDate, toDate, reloadToken])

  const loading = !referenceReady || !jobsReady

  const paymentLabels = useMemo(
    () => new Map(paymentMethods.map((method) => [method.value, method.label_en])),
    [paymentMethods],
  )

  return (
    <>
      <div className="toolbar">
        <label className="field toolbar-field">
          <span>Customer</span>
          <select
            value={customerFilter}
            onChange={(event) => {
              setCustomerFilter(event.target.value)
              setJobsReady(false)
            }}
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customerLabel(customer)}
              </option>
            ))}
          </select>
        </label>

        <label className="field toolbar-field">
          <span>From</span>
          <input
            className="num"
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value)
              setJobsReady(false)
            }}
          />
        </label>

        <label className="field toolbar-field">
          <span>To</span>
          <input
            className="num"
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value)
              setJobsReady(false)
            }}
          />
        </label>

        {(customerFilter || fromDate || toDate) && (
          <button
            type="button"
            className="btn btn--quiet btn--small toolbar-clear"
            onClick={() => {
              setCustomerFilter('')
              setFromDate('')
              setToDate('')
              setJobsReady(false)
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="card notice">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="muted">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p className="empty">No jobs match these filters.</p>
      ) : (
        <>
          {jobs.map((job) => {
            const edited = editedOn(job)
            return (
              <button
                type="button"
                className="card job-row"
                key={job.id}
                onClick={() => setOpenJob(job)}
              >
                <div className="job-row-main">
                  <div className="job-row-title">
                    <span className="num">#{job.job_no}</span>{' '}
                    <span dir="auto">
                      {job.customers ? customerLabel(job.customers) : 'Unknown customer'}
                    </span>
                  </div>
                  <div className="list-row-meta">
                    <span className="num">{job.start_date}</span> ·{' '}
                    <span className="num">{job.vehicles?.plate || 'No vehicle'}</span> ·{' '}
                    <span className="num">{job.job_items[0]?.count ?? 0}</span>{' '}
                    {(job.job_items[0]?.count ?? 0) === 1 ? 'line' : 'lines'}
                    {job.payment_method
                      ? ` · ${paymentLabels.get(job.payment_method) ?? job.payment_method}`
                      : ''}
                    {edited && (
                      <>
                        {' · '}
                        <span className="job-edited">edited {edited}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="num list-row-amount">
                  {money(totals.get(job.id) ?? null)}
                </span>
              </button>
            )
          })}

          {jobs.length === LIST_LIMIT && (
            <p className="field-note">
              Showing the {LIST_LIMIT} most recent jobs. Narrow the filters to see
              older ones.
            </p>
          )}
        </>
      )}

      {openJob && (
        <JobDialog
          job={openJob}
          staff={staff}
          services={services}
          categories={categories}
          paymentMethods={paymentMethods}
          onClose={() => setOpenJob(null)}
          onChanged={() => {
            setOpenJob(null)
            setJobsReady(false)
            setReloadToken((token) => token + 1)
          }}
        />
      )}
    </>
  )
}

/* Job detail ----------------------------------------------------------- */

type ItemDraft = {
  key: string
  id: string | null
  serviceId: string
  laborPrice: string
  nextDueKm: string
  nextDueDate: string
}

function draftFromItem(item: JobItem): ItemDraft {
  return {
    key: item.id,
    id: item.id,
    serviceId: item.service_id,
    laborPrice: item.labor_price === null ? '' : String(item.labor_price),
    nextDueKm: item.next_due_odometer === null ? '' : String(item.next_due_odometer),
    nextDueDate: item.next_due_date ?? '',
  }
}

function sameDraft(a: ItemDraft, b: ItemDraft): boolean {
  return (
    a.laborPrice === b.laborPrice &&
    a.nextDueKm === b.nextDueKm &&
    a.nextDueDate === b.nextDueDate
  )
}

function JobDialog({
  job,
  staff,
  services,
  categories,
  paymentMethods,
  onClose,
  onChanged,
}: {
  job: JobRow
  staff: Staff
  services: Service[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
  onClose: () => void
  onChanged: () => void
}) {
  const [snapshot, setSnapshot] = useState<Map<string, ItemDraft>>(new Map())
  const [drafts, setDrafts] = useState<ItemDraft[]>([])
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [odometer, setOdometer] = useState(
    job.odometer === null ? '' : String(job.odometer),
  )
  const [paymentMethod, setPaymentMethod] = useState(job.payment_method ?? '')

  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [nextKey, setNextKey] = useState(1)

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )

  useEffect(() => {
    let cancelled = false

    supabase
      .from('job_items')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at')
      .then(({ data, error: itemsError }) => {
        if (cancelled) return
        if (itemsError) {
          setError(itemsError.message)
          setLoaded(true)
          return
        }
        const rows = (data ?? []).map(draftFromItem)
        setDrafts(rows)
        setSnapshot(new Map(rows.map((row) => [row.key, row])))
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [job.id])

  const jobOdometer = useMemo(() => {
    const parsed = parseOptionalInteger(odometer)
    return parsed === 'invalid' ? null : parsed
  }, [odometer])

  function updateDraft(key: string, patch: Partial<ItemDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  function removeDraft(draft: ItemDraft) {
    if (draft.id) setRemovedIds((current) => [...current, draft.id as string])
    setDrafts((current) => current.filter((row) => row.key !== draft.key))
  }

  function addDraft() {
    setDrafts((current) => [
      ...current,
      {
        key: `new-${nextKey}`,
        id: null,
        serviceId: '',
        laborPrice: '',
        nextDueKm: '',
        nextDueDate: '',
      },
    ])
    setNextKey((current) => current + 1)
  }

  function chooseService(key: string, serviceId: string) {
    const service = serviceById.get(serviceId)
    updateDraft(key, {
      serviceId,
      laborPrice:
        service?.default_labor_price == null ? '' : String(service.default_labor_price),
      // Based on the job's own date, not today — this line belongs to that visit.
      ...dueDefaults(service, jobOdometer, job.start_date),
    })
  }

  async function handleSave() {
    const parsedOdometer = parseOptionalInteger(odometer)
    if (parsedOdometer === 'invalid') {
      setError('Odometer must be a whole number, or left blank.')
      return
    }

    setError(null)
    setSaving(true)
    const failures: string[] = []

    if (parsedOdometer !== job.odometer || (paymentMethod || null) !== job.payment_method) {
      const { error: jobError } = await supabase
        .from('jobs')
        .update({ odometer: parsedOdometer, payment_method: paymentMethod || null })
        .eq('id', job.id)
      if (jobError) failures.push(`job details: ${jobError.message}`)
    }

    if (removedIds.length > 0) {
      // trg_cancel_reminder handles the reminder side of a deleted line.
      const { error: deleteError } = await supabase
        .from('job_items')
        .delete()
        .in('id', removedIds)
      if (deleteError) failures.push(`removing lines: ${deleteError.message}`)
    }

    for (const draft of drafts) {
      if (!draft.id) continue
      const before = snapshot.get(draft.key)
      if (before && sameDraft(before, draft)) continue

      const price = parseOptionalNumber(draft.laborPrice)
      const dueKm = parseOptionalInteger(draft.nextDueKm)

      // trg_sync_reminder updates the pending reminder from these fields.
      const { error: updateError } = await supabase
        .from('job_items')
        .update({
          labor_price: price === 'invalid' || price === null ? 0 : price,
          next_due_odometer: dueKm === 'invalid' ? null : dueKm,
          next_due_date: draft.nextDueDate || null,
        })
        .eq('id', draft.id)

      if (updateError) {
        const name = serviceById.get(draft.serviceId)?.name_en ?? 'a line'
        failures.push(`${name}: ${updateError.message}`)
      }
    }

    const added = drafts.filter((draft) => !draft.id && draft.serviceId)
    if (added.length > 0) {
      const { error: insertError } = await supabase.from('job_items').insert(
        added.map((draft) => {
          const price = parseOptionalNumber(draft.laborPrice)
          const dueKm = parseOptionalInteger(draft.nextDueKm)
          return {
            job_id: job.id,
            service_id: draft.serviceId,
            labor_price: price === 'invalid' || price === null ? 0 : price,
            next_due_odometer: dueKm === 'invalid' ? null : dueKm,
            next_due_date: draft.nextDueDate || null,
            status: 'done' as const,
          }
        }),
      )
      if (insertError) failures.push(`new lines: ${insertError.message}`)
    }

    setSaving(false)

    if (failures.length > 0) {
      setError(`Some changes did not save — ${failures.join('; ')}.`)
      return
    }

    onChanged()
  }

  async function handleDelete() {
    setSaving(true)
    const { error: deleteError } = await supabase.from('jobs').delete().eq('id', job.id)
    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onChanged()
  }

  const edited = editedOn(job)

  return (
    <Dialog wide title={`Job #${job.job_no}`} onClose={onClose} busy={saving}>
      <div className="detail-lede">
        <div className="detail-phone" dir="auto">
          {job.customers ? customerLabel(job.customers) : 'Unknown customer'}
        </div>
        <div className="detail-since">
          <span className="num">{job.start_date}</span> ·{' '}
          <span className="num">{job.vehicles?.plate || 'No vehicle'}</span> · {job.status}
          {edited && <span className="job-edited"> · edited {edited}</span>}
        </div>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>
            Odometer <span className="field-hint">km</span>
          </span>
          <input
            className="num"
            inputMode="numeric"
            value={odometer}
            onChange={(event) => setOdometer(event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Payment method</span>
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            disabled={saving}
          >
            <option value="">Not recorded</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.value}>
                {method.label_en}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="section-label">
        <span>Lines</span>
      </div>

      {!loaded ? (
        <p className="muted">Loading lines…</p>
      ) : drafts.length === 0 ? (
        <p className="empty">No lines on this job.</p>
      ) : (
        drafts.map((draft) => {
          const service = serviceById.get(draft.serviceId)
          const remindable = service?.triggers_reminder ?? false
          const noReminder =
            remindable && !draft.nextDueKm.trim() && !draft.nextDueDate.trim()

          return (
            <div className="card line" key={draft.key}>
              <div className="line-main">
                {draft.id ? (
                  <div className="field">
                    <span>Service</span>
                    <div className="static-value">{service?.name_en ?? 'Unknown'}</div>
                  </div>
                ) : (
                  <label className="field">
                    <span>Service</span>
                    <select
                      value={draft.serviceId}
                      onChange={(event) => chooseService(draft.key, event.target.value)}
                      disabled={saving}
                    >
                      <option value="">Choose a service</option>
                      {categories.map((category) => {
                        const options = services.filter(
                          (row) => row.category_id === category.id,
                        )
                        if (options.length === 0) return null
                        return (
                          <optgroup key={category.id} label={category.name_en}>
                            {options.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name_en}
                              </option>
                            ))}
                          </optgroup>
                        )
                      })}
                    </select>
                  </label>
                )}

                <label className="field field--narrow">
                  <span>Labour</span>
                  <input
                    className="num"
                    inputMode="decimal"
                    value={draft.laborPrice}
                    onChange={(event) =>
                      updateDraft(draft.key, { laborPrice: event.target.value })
                    }
                    disabled={saving}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => removeDraft(draft)}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>

              {!draft.id && !draft.serviceId && (
                <p className="line-note muted">
                  Choose a service — this line will be skipped otherwise.
                </p>
              )}

              {remindable && (
                <div className="line-reminder">
                  <div className="grid-2">
                    <label className="field">
                      <span>
                        Next due at <span className="field-hint">km</span>
                      </span>
                      <input
                        className="num"
                        inputMode="numeric"
                        value={draft.nextDueKm}
                        onChange={(event) =>
                          updateDraft(draft.key, { nextDueKm: event.target.value })
                        }
                        disabled={saving}
                      />
                    </label>
                    <label className="field">
                      <span>Next due by</span>
                      <input
                        className="num"
                        type="date"
                        value={draft.nextDueDate}
                        onChange={(event) =>
                          updateDraft(draft.key, { nextDueDate: event.target.value })
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>
                  {noReminder && (
                    <p className="line-flag">
                      Both due fields are empty, so this line carries no reminder.
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      <div className="block-actions">
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={addDraft}
          disabled={saving || !loaded}
        >
          Add line
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="step-actions">
        {staff.role === 'admin' ? (
          confirmingDelete ? (
            <div className="confirm-row">
              <span className="muted">Delete this job for good?</span>
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete permanently
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
            >
              Delete job
            </button>
          )
        ) : (
          <span />
        )}

        <button
          type="button"
          className="btn btn--dark"
          onClick={handleSave}
          disabled={saving || !loaded}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Dialog>
  )
}
