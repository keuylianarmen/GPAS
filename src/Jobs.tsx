import { useEffect, useMemo, useState } from 'react'
import type { Database, Json } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import {
  DECIDED_DUE,
  dueDefaults,
  gradeDue,
  regradeDue,
  withRegradedDue,
} from './lib/due'
import type { DueMark } from './lib/due'
import { useGradeIntervals } from './lib/useGradeIntervals'
import {
  emptyFluidDraft,
  fluidDraftFromDetails,
  sameFluid,
  usesFluid,
} from './lib/fluid'
import { lineDetails } from './lib/lineDetails'
import type { FluidDraft } from './lib/fluid'
import {
  emptyTireDraft,
  sameTire,
  tireDraftFromDetails,
  tracksTires,
} from './lib/tire'
import type { TireDraft } from './lib/tire'
import { customerLabel } from './lib/customer'
import { jobVehicleLabel, saveKmPerDay, vehicleLabel } from './lib/vehicle'
import { parseOptionalInteger, priceValue } from './lib/parse'
import { ODOMETER_WARNINGS, useOdometerCheck } from './lib/odometer'
import type { OdometerWarning } from './lib/odometer'
import Dialog from './components/Dialog'
import ServicePicker from './components/ServicePicker'
import { localised, t, tn } from './lib/i18n'
import PriceFields from './components/PriceFields'
import FluidFields from './components/FluidFields'
import TireFields from './components/TireFields'
import OdometerHint from './components/OdometerHint'
import type { OdometerReference } from './components/OdometerHint'
import VehicleDialog from './components/VehicleDialog'
import GradeDueHint from './components/GradeDueHint'

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

export default function Jobs({
  staff,
  onNewJob,
}: {
  staff: Staff
  /** The same state switch the tabs make — New job is a section, not a modal. */
  onNewJob: () => void
}) {
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
        .order('job_no', { ascending: false })
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
    () =>
      new Map(
        paymentMethods.map((method) => [
          method.value,
          localised(method.label_en, method.label_ar) ?? method.label_en,
        ]),
      ),
    [paymentMethods],
  )

  return (
    <>
      <div className="toolbar">
        <label className="field toolbar-field">
          <span>{t('jobs.customer')}</span>
          <select
            value={customerFilter}
            onChange={(event) => {
              setCustomerFilter(event.target.value)
              setJobsReady(false)
            }}
          >
            <option value="">{t('jobs.allCustomers')}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customerLabel(customer)}
              </option>
            ))}
          </select>
        </label>

        <label className="field toolbar-field">
          <span>{t('jobs.from')}</span>
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
          <span>{t('jobs.to')}</span>
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
            className="btn btn--quiet btn--small"
            onClick={() => {
              setCustomerFilter('')
              setFromDate('')
              setToDate('')
              setJobsReady(false)
            }}
          >
            {t('common.clearFilters')}
          </button>
        )}

        {/* Trailing end of the filter row, where Customers puts Add customer.
            Pushed there by margin rather than by a flexing sibling, since this
            toolbar has no search field to grow into the gap. */}
        <button
          type="button"
          className="btn btn--dark toolbar-action"
          onClick={onNewJob}
        >
          {t('jobs.add')}
        </button>
      </div>

      {error && (
        <div className="card notice">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <p className="muted">{t('jobs.loading')}</p>
      ) : jobs.length === 0 ? (
        <p className="empty">{t('jobs.noMatch')}</p>
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
                    <span className="num job-row-no">#{job.job_no}</span>
                    <span dir="auto">
                      {job.customers
                        ? customerLabel(job.customers)
                        : t('jobs.unknownCustomer')}
                    </span>
                  </div>
                  <div className="list-row-meta">
                    <span className="num">{job.start_date}</span> ·{' '}
                    <span className="num">
                      {jobVehicleLabel(job.vehicle_id, job.vehicles)}
                    </span>{' '}
                    ·{' '}
                    <span className="figures" dir="auto">
                      {tn(job.job_items[0]?.count ?? 0, 'jobs.lines')}
                    </span>
                    {job.payment_method
                      ? ` · ${paymentLabels.get(job.payment_method) ?? job.payment_method}`
                      : ''}
                    {edited && (
                      <>
                        {' · '}
                        <span className="job-edited">
                          {t('jobs.editedOn', { date: edited })}
                        </span>
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
              {t('jobs.listCapped', { limit: LIST_LIMIT })}
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
  partPrice: string
  laborPrice: string
  subPrice: string
  nextDueKm: string
  nextDueDate: string
  /** Which of the two the app may still rewrite. See lib/due. */
  dueMark: DueMark
  fluid: FluidDraft
  tire: TireDraft
  /** The line's stored details, so a save preserves keys this screen does not edit. */
  details: Json
  /** The name, for display; the id is what the line stores. */
  subcontractor: string | null
  subcontractorId: string | null
}

type JobItemWithSub = JobItem & { subcontractors: { name: string } | null }

function draftFromItem(item: JobItemWithSub): ItemDraft {
  return {
    key: item.id,
    id: item.id,
    serviceId: item.service_id,
    partPrice: String(item.part_price ?? 0),
    laborPrice: String(item.labor_price ?? 0),
    subPrice: String(item.sub_price ?? 0),
    nextDueKm: item.next_due_odometer === null ? '' : String(item.next_due_odometer),
    nextDueDate: item.next_due_date ?? '',
    // A saved line's due point was settled at that visit, prefilled or typed.
    // Changing the grade afterwards must not reopen it.
    dueMark: DECIDED_DUE,
    fluid: fluidDraftFromDetails(item.details),
    tire: tireDraftFromDetails(item.details),
    details: item.details,
    subcontractor: item.subcontractors?.name ?? null,
    subcontractorId: item.subcontractor_id,
  }
}

function sameDraft(a: ItemDraft, b: ItemDraft): boolean {
  return (
    a.partPrice === b.partPrice &&
    a.laborPrice === b.laborPrice &&
    a.subPrice === b.subPrice &&
    a.subcontractorId === b.subcontractorId &&
    a.nextDueKm === b.nextDueKm &&
    a.nextDueDate === b.nextDueDate &&
    sameFluid(a.fluid, b.fluid) &&
    sameTire(a.tire, b.tire)
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
  const [pickingService, setPickingService] = useState<string | 'new' | null>(null)

  // One query for the dialog: a line cannot call a hook of its own.
  const gradeInterval = useGradeIntervals()

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
      .select('*, subcontractors(name)')
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

  // The job's own reading wins; the linked vehicle's standing reading is the
  // fallback. Uses the pending vehicle so a swap in the same edit is reflected.
  const odometerReference: OdometerReference = useMemo(() => {
    if (jobOdometer !== null) return { value: jobOdometer, source: 'job' }
    const vehicle = linkable.find((row) => row.id === vehicleId)
    return vehicle?.current_odometer == null
      ? null
      : { value: vehicle.current_odometer, source: 'vehicle' }
  }, [jobOdometer, linkable, vehicleId])

  // Follows the pending vehicle, so relinking the job and then picking a grade
  // computes against the car the line will actually belong to.
  const kmPerDay = useMemo(
    () => linkable.find((row) => row.id === vehicleId)?.km_per_day ?? null,
    [linkable, vehicleId],
  )

  function updateDraft(key: string, patch: Partial<ItemDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    )
  }

  /**
   * A daily average answered at a line. It is the car's, so it goes straight
   * to the car — unlike the vehicle link and the reading, which are held until
   * the job is saved, this is not a fact about this visit and there is nothing
   * to hold it for.
   */
  async function saveVehicleUsage(id: string, next: number): Promise<string | null> {
    const saved = await saveKmPerDay(id, next)
    if ('error' in saved) return saved.error

    setLinkable((current) => current.map((row) => (row.id === saved.id ? saved : row)))

    // Every oil line on the job runs off this figure, not just the one that
    // asked. Saved lines are untouched — their due point was settled at that
    // visit. `next` rather than the memo, which has not caught up yet.
    setDrafts((current) =>
      current.map((draft) => {
        const service = serviceById.get(draft.serviceId)
        return withRegradedDue(
          draft,
          gradeDue({
            service,
            interval: gradeInterval(service?.fluid_grade_list ?? null, draft.fluid.grade),
            odometer: jobOdometer,
            kmPerDay: next,
            baseDate: job.start_date,
            line: draft,
          }),
        )
      }),
    )

    return null
  }

  // No vehicle on the job means the question has no subject, so it is not put.
  const onSaveKmPerDay = vehicleId
    ? (next: number) => saveVehicleUsage(vehicleId, next)
    : null

  function removeDraft(draft: ItemDraft) {
    if (draft.id) setRemovedIds((current) => [...current, draft.id as string])
    setDrafts((current) => current.filter((row) => row.key !== draft.key))
  }

  function addDraft(serviceId: string) {
    const service = serviceById.get(serviceId)
    setDrafts((current) => [
      ...current,
      {
        key: `new-${nextKey}`,
        id: null,
        serviceId,
        partPrice: '',
        laborPrice:
          service?.default_labor_price == null ? '' : String(service.default_labor_price),
        subPrice: '',
        subcontractorId: null,
        // Based on the job's own date, not today — the line belongs to that visit.
        ...dueDefaults(service, jobOdometer, job.start_date),
        fluid: emptyFluidDraft(),
        tire: emptyTireDraft(),
        details: {},
        subcontractor: null,
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
      partPrice: '',
      subPrice: '',
      subcontractorId: null,
      // A different service means different consumables, so start clean.
      fluid: emptyFluidDraft(),
      tire: emptyTireDraft(),
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
        // Matches what the trigger cancels; 'pending' alone understates it.
        .in('status', ['pending', 'queued'])

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
      setError(t('jobEdit.badOdometer'))
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
      if (jobError)
        failures.push(`${t('jobEdit.failedJobDetails')}: ${jobError.message}`)
    }

    if (removedIds.length > 0) {
      // trg_cancel_reminder handles the reminder side of a deleted line.
      const { error: deleteError } = await supabase
        .from('job_items')
        .delete()
        .in('id', removedIds)
      if (deleteError)
        failures.push(`${t('jobEdit.failedRemoving')}: ${deleteError.message}`)
    }

    for (const draft of drafts) {
      if (!draft.id) continue
      const before = snapshot.get(draft.key)
      if (before && sameDraft(before, draft)) continue

      const dueKm = parseOptionalInteger(draft.nextDueKm)

      // trg_sync_reminder updates the pending reminder from these fields.
      const { error: updateError } = await supabase
        .from('job_items')
        .update({
          part_price: priceValue(draft.partPrice),
          labor_price: priceValue(draft.laborPrice),
          sub_price: priceValue(draft.subPrice),
          subcontractor_id: draft.subcontractorId,
          next_due_odometer: dueKm === 'invalid' ? null : dueKm,
          next_due_date: draft.nextDueDate || null,
          // Merged, so keys this screen does not edit survive the save.
          details: lineDetails(draft.details, draft.fluid, draft.tire),
        })
        .eq('id', draft.id)

      if (updateError) {
        const service = serviceById.get(draft.serviceId)
        const name =
          (service && localised(service.name_en, service.name_ar)) ??
          t('jobEdit.aLine')
        failures.push(`${name}: ${updateError.message}`)
      }
    }

    const added = drafts.filter((draft) => !draft.id && draft.serviceId)
    if (added.length > 0) {
      const { error: insertError } = await supabase.from('job_items').insert(
        added.map((draft) => {
          const dueKm = parseOptionalInteger(draft.nextDueKm)
          return {
            job_id: job.id,
            service_id: draft.serviceId,
            details: lineDetails({}, draft.fluid, draft.tire),
            part_price: priceValue(draft.partPrice),
            labor_price: priceValue(draft.laborPrice),
            sub_price: priceValue(draft.subPrice),
            // Uniform across the array — see the note in NewJob.
            subcontractor_id: draft.subcontractorId,
            next_due_odometer: dueKm === 'invalid' ? null : dueKm,
            next_due_date: draft.nextDueDate || null,
            status: 'done' as const,
          }
        }),
      )
      if (insertError)
        failures.push(`${t('jobEdit.failedNewLines')}: ${insertError.message}`)
    }

    setSaving(false)

    if (failures.length > 0) {
      setError(t('jobEdit.someFailed', { reasons: failures.join('; ') }))
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
    <Dialog
      wide
      title={t('jobEdit.title', { number: job.job_no })}
      onClose={onClose}
      busy={saving}
    >
      <div className="detail-lede">
        <div className="detail-phone" dir="auto">
          {job.customers ? customerLabel(job.customers) : t('jobs.unknownCustomer')}
        </div>
        <div className="detail-since">
          <span className="num">{job.start_date}</span> ·{' '}
          <span className="num">{jobVehicleLabel(job.vehicle_id, job.vehicles)}</span> ·{' '}
          {job.status}
          {edited && (
            <span className="job-edited">
              {' · '}
              {t('jobs.editedOn', { date: edited })}
            </span>
          )}
        </div>
      </div>

      <label className="field field--narrow">
        <span>{t('jobEdit.vehicle')}</span>
        <select
          value={vehicleId}
          onChange={(event) => {
            setVehicleId(event.target.value)
            setConfirming(null)
          }}
          disabled={saving}
        >
          <option value="">{t('jobEdit.noVehicle')}</option>
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
            {t('jobEdit.odometer')}{' '}
            <span className="field-hint">{t('common.km')}</span>
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
          <span>{t('jobEdit.paymentMethod')}</span>
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            disabled={saving}
          >
            <option value="">{t('common.notRecorded')}</option>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.value}>
                {localised(method.label_en, method.label_ar)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {odometerWarning && (
        <p className="field-warning">{t(ODOMETER_WARNINGS[odometerWarning])}</p>
      )}

      <div className="section-label">
        <span>{t('jobEdit.lines')}</span>
      </div>

      {!loaded ? (
        <p className="muted">{t('jobEdit.loadingLines')}</p>
      ) : drafts.length === 0 ? (
        <p className="empty">{t('jobEdit.noLines')}</p>
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

          // What the grade now on this line implies. Null unless the chosen
          // value carries an interval, which today only oil grades do.
          const interval = gradeInterval(
            service?.fluid_grade_list ?? null,
            draft.fluid.grade,
          )
          // The job's own date, not today — this line belongs to that visit.
          const graded = gradeDue({
            service,
            interval,
            odometer: jobOdometer,
            kmPerDay,
            baseDate: job.start_date,
            line: draft,
          })

          // Marked only where the app actually put something, and never on a
          // saved line: its due point was settled at that visit.
          const kmIsPrefill = draft.dueMark.km && draft.nextDueKm !== ''
          const dateIsPrefill = draft.dueMark.date && draft.nextDueDate !== ''

          // Whether an offer to go back to the computed date belongs here. A
          // new line, always — its date was a prefill minutes ago. A saved
          // line only once its date has moved in this session: an untouched
          // one was decided at that visit, and the reminder syncs back from
          // it, so a standing offer to change it is an invitation to churn
          // history by accident.
          const dateTouched =
            draft.id === null ||
            snapshot.get(draft.key)?.nextDueDate !== draft.nextDueDate

          return (
            <div className="card line" key={draft.key}>
              <div className="line-main">
                {draft.id ? (
                  <div className="field">
                    <span>{t('jobEdit.service')}</span>
                    <div className="static-value">
                      {(service && localised(service.name_en, service.name_ar)) ??
                        t('jobEdit.unknownService')}
                    </div>
                  </div>
                ) : (
                  <div className="field">
                    <span>{t('jobEdit.service')}</span>
                    <button
                      type="button"
                      className="picker-trigger"
                      onClick={() => setPickingService(draft.key)}
                      disabled={saving}
                    >
                      {service
                        ? localised(service.name_en, service.name_ar)
                        : t('jobEdit.chooseService')}
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => removeDraft(draft)}
                  disabled={saving}
                >
                  {t('action.remove')}
                </button>
              </div>

              <PriceFields
                partPrice={draft.partPrice}
                laborPrice={draft.laborPrice}
                subPrice={draft.subPrice}
                subcontractorId={draft.subcontractorId}
                subcontractorName={draft.subcontractor}
                onSubcontractorChange={(id) =>
                  updateDraft(draft.key, { subcontractorId: id })
                }
                disabled={saving}
                onChange={(field, next) => updateDraft(draft.key, { [field]: next })}
              />

              {service && usesFluid(service) && (
                <FluidFields
                  service={service}
                  draft={draft.fluid}
                  onChange={(next) =>
                    updateDraft(draft.key, {
                      fluid: next,
                      // A new grade is a new prefill, for whichever fields are
                      // still the app's to write — on a saved line, neither.
                      ...(next.grade === draft.fluid.grade
                        ? {}
                        : regradeDue(
                            draft,
                            gradeDue({
                              service,
                              interval: gradeInterval(
                                service.fluid_grade_list,
                                next.grade,
                              ),
                              odometer: jobOdometer,
                              kmPerDay,
                              baseDate: job.start_date,
                              line: draft,
                            }),
                          )),
                    })
                  }
                  disabled={saving}
                />
              )}

              {service && tracksTires(service) && (
                <TireFields
                  draft={draft.tire}
                  vehicleId={vehicleId || null}
                  onChange={(next) => updateDraft(draft.key, { tire: next })}
                  disabled={saving}
                />
              )}

              {!draft.id && !draft.serviceId && (
                <p className="line-note muted">
                  {t('jobEdit.chooseServiceHint')}
                </p>
              )}

              {remindable && (
                <div className="line-reminder">
                  <div className="grid-2">
                    <label className="field">
                      <span>
                        {t('jobEdit.nextDueAt')}{' '}
                        <span className="field-hint">{t('common.km')}</span>
                        {kmIsPrefill && (
                          <>
                            {' '}
                            <span className="field-hint">{t('common.suggested')}</span>
                          </>
                        )}
                      </span>
                      <input
                        className={kmIsPrefill ? 'num is-suggested' : 'num'}
                        inputMode="numeric"
                        value={draft.nextDueKm}
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            nextDueKm: event.target.value,
                            // Typed is decided: no later grade may rewrite it.
                            dueMark: { ...draft.dueMark, km: false },
                          })
                        }
                        // The date is measured over the distance this field
                        // implies, so a new reading moves it — into the date
                        // only while that is still the app's. On blur rather
                        // than per keystroke: a half-typed reading is not a
                        // distance, and the date must not jump about while
                        // this one is being entered.
                        onBlur={() => {
                          const { nextDueDate } = regradeDue(draft, graded)
                          if (nextDueDate !== undefined) {
                            updateDraft(draft.key, { nextDueDate })
                          }
                        }}
                        disabled={saving}
                      />
                      <OdometerHint
                        reference={odometerReference}
                        entered={draft.nextDueKm}
                      />
                    </label>
                    <label className="field">
                      <span>
                        {t('jobEdit.nextDueBy')}
                        {dateIsPrefill && (
                          <>
                            {' '}
                            <span className="field-hint">{t('common.suggested')}</span>
                          </>
                        )}
                      </span>
                      <input
                        className={dateIsPrefill ? 'num is-suggested' : 'num'}
                        type="date"
                        value={draft.nextDueDate}
                        onChange={(event) =>
                          updateDraft(draft.key, {
                            nextDueDate: event.target.value,
                            dueMark: { ...draft.dueMark, date: false },
                          })
                        }
                        disabled={saving}
                      />
                    </label>
                  </div>
                  {/* Shown whenever a grade with an interval is on the line —
                      the daily average it carries is a fact about the car, not
                      about whether this line's date has been typed over. */}
                  {graded && interval && (
                    <GradeDueHint
                      // label_en is NOT NULL, so it is always a real fallback.
                      grade={
                        localised(interval.label_en, interval.label_ar) ?? interval.label_en
                      }
                      intervalKm={interval.reminder_km}
                      intervalMonths={interval.reminder_months}
                      kmPerDay={kmPerDay}
                      due={graded}
                      enteredDate={draft.nextDueDate}
                      onUseComputed={
                        dateTouched
                          ? () =>
                              updateDraft(draft.key, {
                                nextDueDate: graded.nextDueDate,
                                dueMark: { ...draft.dueMark, date: true },
                              })
                          : null
                      }
                      onSaveKmPerDay={onSaveKmPerDay}
                      disabled={saving}
                    />
                  )}
                  {noReminder && (
                    <p className="line-flag">
                      {t('jobEdit.noReminderBlank')}
                    </p>
                  )}
                  {wontCreate && (
                    <p className="line-flag">
                      {t('jobEdit.noReminderNoVehicle')}
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
          onClick={() => setPickingService('new')}
          disabled={saving || !loaded}
        >
          {t('jobEdit.addLine')}
        </button>
      </div>

      {pickingService !== null && (
        <ServicePicker
          services={services}
          categories={categories}
          onClose={() => setPickingService(null)}
          onPick={(serviceId) => {
            if (pickingService === 'new') addDraft(serviceId)
            else chooseService(pickingService, serviceId)
            setPickingService(null)
          }}
        />
      )}

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
              <span className="muted">{t('jobEdit.deleteConfirm')}</span>
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={handleDelete}
                disabled={saving}
              >
                {t('jobEdit.deletePermanently')}
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                {t('jobEdit.keep')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
            >
              {t('jobEdit.deleteJob')}
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
          {saving
            ? t('action.saving')
            : preparing
              ? t('jobEdit.checking')
              : t('action.saveChanges')}
        </button>
      </div>
    </Dialog>
  )
}

/* Vehicle change confirmation ------------------------------------------ */

function reading(value: number | null): string {
  return value === null
    ? t('vehicleChange.notRecorded')
    : `${km(value)} ${t('common.km')}`
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
  const oldLabel = oldVehicle
    ? vehicleLabel(oldVehicle)
    : t('vehicleChange.previousVehicle')
  const parsedReading = parseOptionalInteger(jobReading)

  return (
    <div className="card notice confirm-panel">
      <p className="confirm-title">
        {clearing
          ? t('vehicleChange.removeTitle', { vehicle: oldLabel })
          : t('vehicleChange.moveTitle', { vehicle: vehicleLabel(newVehicle) })}
      </p>

      <p>
        {change.moving === 0
          ? t('vehicleChange.noneRaised')
          : clearing
            ? tn(change.moving, 'vehicleChange.cancelled')
            : tn(change.moving, 'vehicleChange.moving', {
                from: oldLabel,
                to: vehicleLabel(newVehicle),
              })}
      </p>

      {!clearing && (
        <div className="confirm-figures">
          <div className="summary-row">
            <span className="muted">
              {t('vehicleChange.reads', { vehicle: vehicleLabel(newVehicle) })}
            </span>
            <span className="figures" dir="auto">
              {reading(newVehicle.current_odometer)}
            </span>
          </div>
          <div className="summary-row">
            <span className="muted">{t('vehicleChange.jobRecords')}</span>
            <span className="figures" dir="auto">
              {parsedReading === 'invalid' || parsedReading === null
                ? t('vehicleChange.notRecorded')
                : `${km(parsedReading)} ${t('common.km')}`}
            </span>
          </div>
        </div>
      )}

      {odometerWarning && !clearing && (
        <p className="field-warning">{t(ODOMETER_WARNINGS[odometerWarning])}</p>
      )}

      {oldVehicle && (
        <>
          <div className="confirm-figures">
            <div className="summary-row">
              <span className="muted">
                {t('vehicleChange.reads', { vehicle: oldLabel })}
              </span>
              <span className="figures" dir="auto">
                {reading(oldVehicle.current_odometer)}
              </span>
            </div>
            <div className="summary-row">
              <span className="muted">{t('vehicleChange.withoutJob')}</span>
              <span className="figures" dir="auto">
                {reading(change.withoutJob)}
              </span>
            </div>
          </div>
          <p className="field-note">
            {t('vehicleChange.notRolledBack')}
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => onEditOldVehicle(oldVehicle)}
            disabled={busy}
          >
            {t('vehicleChange.editVehicle', { vehicle: oldLabel })}
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
          {busy
            ? t('action.saving')
            : clearing
              ? t('vehicleChange.removeAndSave')
              : t('vehicleChange.moveAndSave')}
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={onCancel}
          disabled={busy}
        >
          {t('action.cancel')}
        </button>
      </div>
    </div>
  )
}
