import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import { dueDefaults } from './lib/due'
import { customerLabel } from './lib/customer'
import { jobVehicleLabel, vehicleLabel } from './lib/vehicle'
import { parseOptionalInteger, parseOptionalNumber } from './lib/parse'
import { ODOMETER_WARNINGS, useOdometerCheck } from './lib/odometer'
import type { OdometerWarning } from './lib/odometer'
import Dialog from './components/Dialog'
import VehicleDialog from './components/VehicleDialog'

type Job = Database['public']['Tables']['jobs']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']
type JobItem = Database['public']['Tables']['job_items']['Row']
type Service = Database['public']['Tables']['services']['Row']
type Category = Database['public']['Tables']['service_categories']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type PaymentMethod = Database['public']['Tables']['lookup_values']['Row']
type Staff = Database['public']['Tables']['staff']['Row']

type JobRow = Job & {
  customers: { name_en: string | null; name_ar: string | null } | null
  vehicles: { plate: string | null; make: string | null; model: string | null } | null
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
        .select('*, customers(name_en, name_ar), vehicles(plate, make, model), job_items(count)')
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
                    <span className="num">
                      {jobVehicleLabel(job.vehicle_id, job.vehicles)}
                    </span>{' '}
                    ·{' '}
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

type VehicleChange = {
  /** Pending reminders this job's lines raised on the vehicle being replaced. */
  moving: number
  /** What the old vehicle would read without this job — advisory, not applied. */
  withoutJob: number | null
}

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
  const [vehicleId, setVehicleId] = useState<string>(job.vehicle_id ?? '')
  const [linkable, setLinkable] = useState<Vehicle[]>([])
  const [paymentMethod, setPaymentMethod] = useState(job.payment_method ?? '')

  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirming, setConfirming] = useState<VehicleChange | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [nextKey, setNextKey] = useState(1)

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vehicles')
      .select('*')
      .eq('customer_id', job.customer_id)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelled) setLinkable(data ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [job.customer_id])

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

  // Uses the pending vehicle, so linking one and correcting the reading in the
  // same edit is checked against the vehicle it will actually be saved against.
  const odometerWarning = useOdometerCheck(vehicleId || null, odometer)

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

  /**
   * Changing or clearing a vehicle moves reminders and leaves the old vehicle's
   * reading behind, so it is confirmed rather than saved straight away.
   */
  async function handleSaveClick() {
    const nextVehicleId = vehicleId || null
    if (nextVehicleId === job.vehicle_id || job.vehicle_id === null) {
      await handleSave()
      return
    }

    setError(null)
    setPreparing(true)

    const savedLineIds = drafts.flatMap((draft) => (draft.id ? [draft.id] : []))

    let moving = 0
    if (savedLineIds.length > 0) {
      const { count, error: countError } = await supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .in('job_item_id', savedLineIds)
        .eq('vehicle_id', job.vehicle_id)
        .eq('status', 'pending')

      if (countError) {
        setError(countError.message)
        setPreparing(false)
        return
      }
      moving = count ?? 0
    }

    // What the old vehicle would read if this job had never been recorded.
    const { data: withoutJob, error: rpcError } = await supabase.rpc(
      'vehicle_odometer_without_job',
      { p_vehicle_id: job.vehicle_id, p_job_id: job.id },
    )

    if (rpcError) {
      setError(rpcError.message)
      setPreparing(false)
      return
    }

    setPreparing(false)
    setConfirming({ moving, withoutJob: withoutJob ?? null })
  }

  async function handleSave() {
    setConfirming(null)
    const parsedOdometer = parseOptionalInteger(odometer)
    if (parsedOdometer === 'invalid') {
      setError('Odometer must be a whole number, or left blank.')
      return
    }

    setError(null)
    setSaving(true)
    const failures: string[] = []

    const nextVehicleId = vehicleId || null
    if (
      parsedOdometer !== job.odometer ||
      (paymentMethod || null) !== job.payment_method ||
      nextVehicleId !== job.vehicle_id
    ) {
      // Written before the lines below, so a line inserted in the same save
      // sees the vehicle and its trigger can raise a reminder.
      const { error: jobError } = await supabase
        .from('jobs')
        .update({
          odometer: parsedOdometer,
          payment_method: paymentMethod || null,
          vehicle_id: nextVehicleId,
        })
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
          <span className="num">{jobVehicleLabel(job.vehicle_id, job.vehicles)}</span> ·{' '}
          {job.status}
          {edited && <span className="job-edited"> · edited {edited}</span>}
        </div>
      </div>

      <label className="field field--narrow">
        <span>Vehicle</span>
        <select
          value={vehicleId}
          onChange={(event) => {
            setVehicleId(event.target.value)
            setConfirming(null)
          }}
          disabled={saving}
        >
          <option value="">No vehicle</option>
          {linkable.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicleLabel(vehicle)}
            </option>
          ))}
        </select>
      </label>

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

      {odometerWarning && (
        <p className="field-warning">{ODOMETER_WARNINGS[odometerWarning]}</p>
      )}

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
          const hasDue =
            draft.nextDueKm.trim() !== '' || draft.nextDueDate.trim() !== ''
          const noReminder = remindable && !hasDue
          // Reminders need a vehicle. Saved lines included: the swap trigger
          // raises them for every line when a vehicle is attached.
          const wontCreate = remindable && hasDue && vehicleId === ''

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
                  {wontCreate && (
                    <p className="line-flag">
                      This job has no vehicle, so this line carries no reminder.
                      Attaching one raises it.
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

      {confirming && (
        <VehicleChangeConfirm
          change={confirming}
          oldVehicle={linkable.find((row) => row.id === job.vehicle_id) ?? null}
          newVehicle={linkable.find((row) => row.id === vehicleId) ?? null}
          reading={odometer}
          odometerWarning={odometerWarning}
          busy={saving}
          onEditOldVehicle={(vehicle) => setEditingVehicle(vehicle)}
          onCancel={() => setConfirming(null)}
          onConfirm={handleSave}
        />
      )}

      {editingVehicle && (
        <VehicleDialog
          customerId={job.customer_id}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={(updated) => {
            setLinkable((current) =>
              current.map((row) => (row.id === updated.id ? updated : row)),
            )
            setEditingVehicle(null)
          }}
        />
      )}

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
          onClick={handleSaveClick}
          disabled={saving || preparing || !loaded}
        >
          {saving ? 'Saving…' : preparing ? 'Checking…' : 'Save changes'}
        </button>
      </div>
    </Dialog>
  )
}

/* Vehicle change confirmation ------------------------------------------ */

function reading(value: number | null): string {
  return value === null ? 'not recorded' : `${km(value)} km`
}

function VehicleChangeConfirm({
  change,
  oldVehicle,
  newVehicle,
  reading: jobReading,
  odometerWarning,
  busy,
  onEditOldVehicle,
  onCancel,
  onConfirm,
}: {
  change: VehicleChange
  oldVehicle: Vehicle | null
  newVehicle: Vehicle | null
  reading: string
  odometerWarning: OdometerWarning | null
  busy: boolean
  onEditOldVehicle: (vehicle: Vehicle) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const clearing = newVehicle === null
  const oldLabel = oldVehicle ? vehicleLabel(oldVehicle) : 'the previous vehicle'
  const parsedReading = parseOptionalInteger(jobReading)

  return (
    <div className="card notice confirm-panel">
      <p className="confirm-title">
        {clearing
          ? `Remove ${oldLabel} from this job?`
          : `Move this job to ${vehicleLabel(newVehicle)}?`}
      </p>

      <p>
        {change.moving === 0 ? (
          <>No pending reminders were raised by this job&rsquo;s lines.</>
        ) : clearing ? (
          <>
            <span className="num">{change.moving}</span> pending{' '}
            {change.moving === 1 ? 'reminder' : 'reminders'} raised by this
            job&rsquo;s lines will be cancelled.
          </>
        ) : (
          <>
            <span className="num">{change.moving}</span> pending{' '}
            {change.moving === 1 ? 'reminder' : 'reminders'} will move from{' '}
            {oldLabel} to {vehicleLabel(newVehicle)}.
          </>
        )}
      </p>

      {!clearing && (
        <div className="confirm-figures">
          <div className="summary-row">
            <span className="muted">{vehicleLabel(newVehicle)} reads</span>
            <span className="num">{reading(newVehicle.current_odometer)}</span>
          </div>
          <div className="summary-row">
            <span className="muted">This job records</span>
            <span className="num">
              {parsedReading === 'invalid' || parsedReading === null
                ? 'not recorded'
                : `${km(parsedReading)} km`}
            </span>
          </div>
        </div>
      )}

      {odometerWarning && !clearing && (
        <p className="field-warning">{ODOMETER_WARNINGS[odometerWarning]}</p>
      )}

      {oldVehicle && (
        <>
          <div className="confirm-figures">
            <div className="summary-row">
              <span className="muted">{oldLabel} reads</span>
              <span className="num">{reading(oldVehicle.current_odometer)}</span>
            </div>
            <div className="summary-row">
              <span className="muted">Without this job it would read</span>
              <span className="num">{reading(change.withoutJob)}</span>
            </div>
          </div>
          <p className="field-note">
            That reading is not rolled back — it may have been typed by hand.
            Change it yourself if it is wrong.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onEditOldVehicle(oldVehicle)}
            disabled={busy}
          >
            Edit {oldLabel}
          </button>
        </>
      )}

      <div className="confirm-row">
        <button
          type="button"
          className="btn btn--dark btn--small"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Saving…' : clearing ? 'Remove and save' : 'Move and save'}
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
