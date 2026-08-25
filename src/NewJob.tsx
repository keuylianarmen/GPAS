import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database, Json } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import { todayIso } from './lib/date'
import {
  DECIDED_DUE,
  UNTOUCHED_DUE,
  dueDefaults,
  gradeDue,
  rederivedDue,
  regradeDue,
  withDue,
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
import {
  deleteOpenJob,
  completeJob,
  createLine,
  createOpenJob,
  deleteLine,
  patchJob,
  patchLine,
} from './lib/openJob'
import type { FluidDraft } from './lib/fluid'
import {
  emptyTireDraft,
  sameTire,
  tireDraftFromDetails,
  tracksTires,
} from './lib/tire'
import type { TireDraft } from './lib/tire'
import { customerLabel, matchesCustomerSearch } from './lib/customer'
import { jobVehicleLabel, vehicleLabel } from './lib/vehicle'
import { parseOptionalInteger, priceValue, sumPrices } from './lib/parse'
import { ODOMETER_WARNINGS, useOdometerCheck } from './lib/odometer'
import Collapsible from './components/Collapsible'
import ServicePicker from './components/ServicePicker'
import { localised, t, tn } from './lib/i18n'
import type { StringKey } from './lib/i18n'
import Dialog from './components/Dialog'
import PriceFields from './components/PriceFields'
import FluidFields from './components/FluidFields'
import TireFields from './components/TireFields'
import OdometerHint from './components/OdometerHint'
import GradeDueHint from './components/GradeDueHint'
import type { OdometerReference } from './components/OdometerHint'
import AddCustomerDialog from './components/AddCustomerDialog'
import ServiceDialog from './components/ServiceDialog'
import VehicleFields from './components/VehicleFields'
import {
  emptyVehicleDraft,
  isBlankVehicle,
  saveKmPerDay,
  vehicleInsertFrom,
} from './lib/vehicle'
import type { VehicleDraft } from './lib/vehicle'

type Customer = Database['public']['Tables']['customers']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']
type Job = Database['public']['Tables']['jobs']['Row']
type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']
type PaymentMethod = Database['public']['Tables']['lookup_values']['Row']

/** An open job as the resume strip needs it — enough to recognise, no more. */
type ResumableJob = Job & {
  customers: { name_en: string | null; name_ar: string | null } | null
  vehicles: { plate: string | null; make: string | null; model: string | null } | null
  job_items: { count: number }[]
}

type Line = {
  key: number
  /** The job_items row, once a service has been chosen and it exists. */
  id: string | null
  serviceId: string
  partPrice: string
  laborPrice: string
  subPrice: string
  subcontractorId: string | null
  nextDueKm: string
  nextDueDate: string
  /** Which of the two the app may still rewrite. See lib/due. */
  dueMark: DueMark
  fluid: FluidDraft
  tire: TireDraft
  /** The row's stored details, so a save preserves keys this screen does not edit. */
  details: Json
}

/**
 * The columns a line writes. Every key is named on every row, including the
 * null ones: postgrest builds its column list from the union of the keys
 * present and writes NULL into any row missing one another row has.
 */
function lineFields(line: Line) {
  const dueKm = parseOptionalInteger(line.nextDueKm)
  return {
    details: lineDetails(line.details, line.fluid, line.tire),
    part_price: priceValue(line.partPrice),
    labor_price: priceValue(line.laborPrice),
    sub_price: priceValue(line.subPrice),
    subcontractor_id: line.subcontractorId,
    next_due_odometer: dueKm === 'invalid' ? null : dueKm,
    next_due_date: line.nextDueDate || null,
  }
}

/**
 * What a line looks like to the autosave. Compared rather than diffed: the
 * only question is whether the row on the server still matches the screen.
 */
function lineSignature(line: Line): string {
  return JSON.stringify([line.serviceId, lineFields(line)])
}

/**
 * Whether a line holds anything a customer change would throw away.
 *
 * A line that exists but has nothing in it is not work: the services step
 * opens a picker automatically on arrival, so an untouched blank line is the
 * normal state of a job nobody has typed into yet, and prompting about it
 * would be prompting about nothing.
 */
function lineHasWork(line: Line): boolean {
  return (
    line.serviceId !== '' ||
    line.partPrice.trim() !== '' ||
    line.laborPrice.trim() !== '' ||
    line.subPrice.trim() !== '' ||
    line.subcontractorId !== null ||
    line.nextDueKm.trim() !== '' ||
    line.nextDueDate.trim() !== '' ||
    !sameFluid(line.fluid, emptyFluidDraft()) ||
    !sameTire(line.tire, emptyTireDraft())
  )
}

const STEPS: StringKey[] = [
  'newJob.stepCustomer',
  'newJob.stepVehicle',
  'newJob.stepServices',
  'newJob.stepPayment',
]

/**
 * The vehicle this job is most likely for: the only one, else the one from the
 * customer's most recent job, else the most recently added. `rows` arrives
 * oldest first.
 */
function defaultVehicle(rows: Vehicle[], lastJobVehicleId: string | null): Vehicle | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]

  const fromLastJob = lastJobVehicleId
    ? rows.find((row) => row.id === lastJobVehicleId)
    : undefined

  return fromLastJob ?? rows[rows.length - 1]
}

function describeVehicle(vehicle: Vehicle): string {
  const spec = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')
  return spec || t('newJob.noVehicleDetails')
}

export default function NewJob({
  resumeJobId,
  onResumeHandled,
}: {
  /** An open job to open straight into, handed over from the Jobs screen. */
  resumeJobId?: string | null
  onResumeHandled?: () => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [step, setStep] = useState(0)

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  // A customer change waiting on the confirmation. 'new' is the same change
  // via the add dialog, which has no customer to name yet.
  const [pendingCustomer, setPendingCustomer] = useState<Customer | 'new' | null>(null)
  const [pickingCustomer, setPickingCustomer] = useState(true)

  // Tagged with the customer it belongs to, so a stale list is never shown
  // while a different customer's vehicles are still loading.
  const [vehicleLoad, setVehicleLoad] = useState<{
    customerId: string
    rows: Vehicle[]
  } | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  // Distinguishes "not chosen yet" from the deliberate choice of no vehicle,
  // since both leave vehicleId null.
  const [vehicleChosen, setVehicleChosen] = useState(false)
  const [pickingVehicle, setPickingVehicle] = useState(false)
  const [odometer, setOdometer] = useState('')
  const [addingVehicle, setAddingVehicle] = useState(false)

  const [lines, setLines] = useState<Line[]>([])
  const [addingService, setAddingService] = useState(false)
  const [pickingService, setPickingService] = useState<number | 'new' | null>(null)
  const nextLineKey = useRef(1)

  const [paymentMethod, setPaymentMethod] = useState('')

  // One query for the screen: a line cannot call a hook of its own.
  const gradeInterval = useGradeIntervals()

  const continueRef = useRef<HTMLButtonElement>(null)
  const servicePickerOpened = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedJob, setSavedJob] = useState<Job | null>(null)
  const [savedTotal, setSavedTotal] = useState<number | null>(null)

  // The open row every step writes to. Null only before a customer is chosen,
  // or when creating it failed — which is a state the screen has to show
  // rather than paper over, since nothing is being saved until it exists.
  const [job, setJob] = useState<Job | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)
  const [startingJob, setStartingJob] = useState(false)

  // Open jobs found on arrival, offered rather than resumed automatically —
  // the person at the counter knows whether this is the same car.
  const [resumable, setResumable] = useState<ResumableJob[] | null>(null)
  const [resuming, setResuming] = useState(false)

  // A resumed job can point at a vehicle that is no longer this customer's.
  const [strandedVehicle, setStrandedVehicle] = useState<string | null>(null)

  // What the server holds for each line, so the autosave writes only changes.
  const lineSync = useRef({
    signature: new Map<number, string>(),
    inFlight: new Set<number>(),
    // Lines removed while their insert was in flight. Without this the row
    // lands after the line is gone and nothing ever deletes it.
    removed: new Set<number>(),
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [customerResult, categoryResult, serviceResult, paymentResult] =
        await Promise.all([
          supabase.from('customers').select('*').order('created_at', { ascending: false }),
          supabase
            .from('service_categories')
            .select('*')
            .eq('active', true)
            .order('sort_order')
            .order('name_en'),
          supabase.from('services').select('*').eq('active', true).order('name_en'),
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
        categoryResult.error ??
        serviceResult.error ??
        paymentResult.error

      if (failure) {
        setLoadError(failure.message)
        setLoading(false)
        return
      }

      setCustomers(customerResult.data ?? [])
      setCategories(categoryResult.data ?? [])
      setServices(serviceResult.data ?? [])
      setPaymentMethods(paymentResult.data ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Open jobs, looked for once on arrival.
   *
   * This screen is unmounted every time the user looks at another tab, so an
   * unfinished job is not an unusual state — it is what a glance at Reminders
   * mid-entry leaves behind. Offering them here is what stops that becoming a
   * row nobody ever sees again.
   */
  useEffect(() => {
    if (resumeJobId) return

    let cancelled = false
    supabase
      .from('jobs')
      .select(
        '*, customers(name_en, name_ar), vehicles(plate, make, model), job_items(count)',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Not fatal: a new job can still be started without this list.
          console.error('Could not look for unfinished jobs', error)
          return
        }
        setResumable(data ?? [])
      })

    return () => {
      cancelled = true
    }
  }, [resumeJobId])

  /** Arriving from the Jobs screen with one already chosen. */
  useEffect(() => {
    if (!resumeJobId) return

    let cancelled = false
    supabase
      .from('jobs')
      .select('*')
      .eq('id', resumeJobId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        onResumeHandled?.()
        if (error || !data) {
          setJobError(error?.message ?? t('newJob.resumeLoadFailed'))
          return
        }
        resumeJob(data)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeJobId])

  // Vehicles belong to the chosen customer, so they load on selection rather
  // than up front.
  useEffect(() => {
    if (!customer) return

    let cancelled = false
    const customerId = customer.id

    async function load() {
      const [vehicleResult, lastJobResult] = await Promise.all([
        supabase.from('vehicles').select('*').eq('customer_id', customerId).order('created_at'),
        // Only to seed the default choice, so one row is enough.
        supabase
          .from('jobs')
          .select('vehicle_id')
          .eq('customer_id', customerId)
          .not('vehicle_id', 'is', null)
          .order('start_date', { ascending: false })
          .order('job_no', { ascending: false })
          .limit(1),
      ])

      if (cancelled) return

      const failure = vehicleResult.error ?? lastJobResult.error
      if (failure) setSaveError(failure.message)

      const rows = vehicleResult.data ?? []
      setVehicleLoad({ customerId, rows })

      const preselected = defaultVehicle(
        rows,
        lastJobResult.data?.[0]?.vehicle_id ?? null,
      )
      setVehicleId(preselected?.id ?? null)
      setVehicleChosen(preselected !== null)
      setPickingVehicle(false)
      setOdometer(
        preselected?.current_odometer == null ? '' : String(preselected.current_odometer),
      )
    }

    load()

    return () => {
      cancelled = true
    }
  }, [customer])

  const vehiclesReady =
    customer !== null && vehicleLoad !== null && vehicleLoad.customerId === customer.id
  // Memoised so its identity is stable for the hooks that depend on it.
  const vehicles = useMemo(
    () => (vehiclesReady && vehicleLoad !== null ? vehicleLoad.rows : []),
    [vehiclesReady, vehicleLoad],
  )
  const vehiclesLoading = customer !== null && !vehiclesReady

  const odometerWarning = useOdometerCheck(vehicleId, odometer)

  const jobOdometer = useMemo(() => {
    const parsed = parseOptionalInteger(odometer)
    return parsed === 'invalid' ? null : parsed
  }, [odometer])

  // The job's own reading wins; the vehicle's standing reading is the fallback.
  const odometerReference: OdometerReference = useMemo(() => {
    if (jobOdometer !== null) return { value: jobOdometer, source: 'job' }
    const vehicle = vehicles.find((row) => row.id === vehicleId)
    return vehicle?.current_odometer == null
      ? null
      : { value: vehicle.current_odometer, source: 'vehicle' }
  }, [jobOdometer, vehicles, vehicleId])

  /**
   * A resumed job whose vehicle is not among this customer's any more — moved
   * to another owner, or removed outright.
   *
   * Deliberately not treated as "no vehicle". The job still carries the id,
   * and rewriting that to null because the app cannot resolve it would change
   * what the job says without anyone deciding to. Instead the choice is
   * reopened: the picker stays open, the notice explains, and the row is left
   * alone until somebody picks.
   */
  const vehicleUnresolved =
    strandedVehicle !== null &&
    vehiclesReady &&
    !vehicles.some((row) => row.id === strandedVehicle)

  // Only the linked vehicle has a daily average, so a counter sale computes
  // its dates from the months alone.
  const kmPerDay = useMemo(
    () => vehicles.find((row) => row.id === vehicleId)?.km_per_day ?? null,
    [vehicles, vehicleId],
  )

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )

  const visibleCustomers = useMemo(
    () => customers.filter((row) => matchesCustomerSearch(row, customerQuery)),
    [customers, customerQuery],
  )

  const filledLines = lines.filter((line) => line.serviceId !== '')

  const linesWithWork = lines.filter(lineHasWork).length
  const linesHoldWork = linesWithWork > 0

  const linesTotal = filledLines.reduce(
    (sum, line) => sum + sumPrices(line.partPrice, line.laborPrice, line.subPrice),
    0,
  )

  /** Prefills come from the service's usual interval plus this job's readings. */
  function applyService(line: Line, serviceId: string): Line {
    const service = serviceById.get(serviceId)
    return {
      ...line,
      serviceId,
      partPrice: '',
      laborPrice:
        service?.default_labor_price == null ? '' : String(service.default_labor_price),
      subPrice: '',
      subcontractorId: null,
      // A different service means different consumables, so start clean.
      fluid: emptyFluidDraft(),
      tire: emptyTireDraft(),
      ...dueDefaults(service, jobOdometer, todayIso()),
    }
  }

  function addLine(serviceId = '') {
    const base: Line = {
      key: nextLineKey.current++,
      id: null,
      serviceId: '',
      partPrice: '',
      laborPrice: '',
      subPrice: '',
      subcontractorId: null,
      nextDueKm: '',
      nextDueDate: '',
      dueMark: UNTOUCHED_DUE,
      fluid: emptyFluidDraft(),
      tire: emptyTireDraft(),
      details: {},
    }
    setLines((current) => [...current, serviceId ? applyService(base, serviceId) : base])
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  /**
   * Writes every line whose contents no longer match what the server holds.
   *
   * One pass over the lines rather than a save hook on each field. The child
   * field components have no idea a row exists behind them and should not
   * need to: a line is data, and this is the one place that knows how to put
   * data on the server.
   *
   * A line with no service is not a row yet — the picker opens an empty one
   * automatically, and an empty line is not something anyone typed.
   */
  async function syncLines(jobId: string, rows: Line[]): Promise<Line[]> {
    // Returned rather than read back from state: `updateLine` schedules a
    // render, so the ids it writes are not visible on the array this call was
    // handed. The completion path needs to know what actually landed.
    const settled = [...rows]

    for (const [index, line] of settled.entries()) {
      if (!line.serviceId) continue

      const signature = lineSignature(line)
      const sync = lineSync.current
      if (sync.signature.get(line.key) === signature) continue
      // An insert already on its way. Skipping leaves the row unwritten for
      // now; the next pass sees the same difference and writes it then.
      if (sync.inFlight.has(line.key)) continue

      sync.inFlight.add(line.key)
      try {
        if (line.id === null) {
          const row = await createLine(jobId, line.serviceId, lineFields(line))
          if ('error' in row) {
            setJobError(row.error)
            continue
          }
          // Removed while the insert was in flight: the line is gone from the
          // screen, so the row it just created has to go too.
          if (sync.removed.has(line.key)) {
            sync.removed.delete(line.key)
            await deleteLine(row.id)
            continue
          }
          settled[index] = { ...line, id: row.id }
          updateLine(line.key, { id: row.id })
        } else {
          const failure = await patchLine(line.id, {
            service_id: line.serviceId,
            ...lineFields(line),
          })
          if (failure) {
            setJobError(failure)
            continue
          }
        }
        // Recorded only on success, so a failed write is retried rather than
        // remembered as saved.
        sync.signature.set(line.key, signature)
        setJobError(null)
      } finally {
        sync.inFlight.delete(line.key)
      }
    }

    return settled
  }

  // Settles after typing stops rather than on every keystroke. The delay is
  // the only thing that can be lost to a crash, and it costs one request per
  // pause instead of one per character.
  useEffect(() => {
    if (job === null) return

    const timer = setTimeout(() => {
      syncLines(job.id, lines)
    }, 700)

    return () => clearTimeout(timer)
    // syncLines closes over state it re-reads each call; re-running on a new
    // identity every render would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, lines])

  /**
   * Removing a line removes its row. trg_cancel_reminder fires and finds
   * nothing to cancel — an 'open' line never created a reminder — so this is
   * a plain delete rather than the careful supersede the Jobs screen needs.
   */
  async function removeLine(line: Line) {
    setLines((current) => current.filter((row) => row.key !== line.key))
    lineSync.current.signature.delete(line.key)

    if (line.id === null) {
      // Nothing to delete yet — but an insert may be in flight, and syncLines
      // deletes what it creates if it finds the key here.
      if (lineSync.current.inFlight.has(line.key)) {
        lineSync.current.removed.add(line.key)
      }
      return
    }
    const failure = await deleteLine(line.id)
    if (failure) setJobError(failure)
  }

  /** Applies a patch to the open job and keeps the local row in step. */
  async function saveJob(patch: Parameters<typeof patchJob>[1]) {
    if (!job) return
    const saved = await patchJob(job.id, patch)
    if ('error' in saved) {
      setJobError(saved.error)
      return
    }
    setJob(saved)
    setJobError(null)
  }

  /**
   * A daily average answered at a line. It is the car's, so it goes to the
   * car — every vehicle this screen can reach is already saved, including one
   * added a moment ago, because the add dialog inserts before it returns.
   * There is no unsaved vehicle to defer a write against.
   */
  async function saveVehicleUsage(id: string, next: number): Promise<string | null> {
    const saved = await saveKmPerDay(id, next)
    if ('error' in saved) return saved.error

    setVehicleLoad((current) =>
      current === null
        ? current
        : {
            ...current,
            rows: current.rows.map((row) => (row.id === saved.id ? saved : row)),
          },
    )

    // Every oil line on the job runs off this figure, not just the one that
    // asked. `next` rather than the memo: the vehicle row above has not
    // re-rendered yet, so the memo is still holding the old average.
    setLines((current) =>
      current.map((line) => {
        const service = serviceById.get(line.serviceId)
        return withDue(
          line,
          regradeDue(
            line,
            gradeDue({
              service,
              interval: gradeInterval(
                service?.fluid_grade_list ?? null,
                line.fluid.grade,
              ),
              odometer: jobOdometer,
              kmPerDay: next,
              baseDate: todayIso(),
              line,
            }),
          ),
        )
      }),
    )

    return null
  }

  // No vehicle on the job means the question has no subject, so it is not put.
  const onSaveKmPerDay =
    vehicleId === null ? null : (next: number) => saveVehicleUsage(vehicleId, next)

  const selectedVehicle = vehicles.find((row) => row.id === vehicleId) ?? null

  /**
   * Clears everything the previous customer's job put on screen. The rows
   * themselves are dealt with by the caller — discarded, or never created.
   */
  function clearJobState() {
    setVehicleId(null)
    setVehicleChosen(false)
    setOdometer('')
    setLines([])
    setStrandedVehicle(null)
    lineSync.current.signature.clear()
    lineSync.current.inFlight.clear()
    lineSync.current.removed.clear()
    servicePickerOpened.current = false
  }

  /**
   * Moves to a customer, opening the row that every later step writes to.
   *
   * An open job with nothing on it is worth moving rather than replacing: a
   * mis-click on the customer list should cost a row update, not a `job_no`.
   * Once there is work on it, `chooseCustomer` has already discarded it and
   * passes `fresh` so a new row is opened instead.
   */
  async function switchCustomer(next: Customer, fresh = false) {
    setCustomer(next)
    setPickingCustomer(false)
    clearJobState()

    if (job !== null && !fresh) {
      await saveJob({ customer_id: next.id, vehicle_id: null, odometer: null })
      return
    }

    setJob(null)
    setStartingJob(true)
    setJobError(null)

    const created = await createOpenJob(next.id)
    setStartingJob(false)

    if ('error' in created) {
      // The customer stays chosen and the error stays on screen. Continue is
      // disabled until there is a row, because until then the promise this
      // screen makes — that nothing is lost — is not one it can keep.
      setJobError(created.error)
      return
    }
    setJob(created)
  }

  /** Retry for a failed open, from the notice the failure puts on screen. */
  async function retryStartJob() {
    if (customer) await switchCustomer(customer, true)
  }

  async function chooseCustomer(next: Customer) {
    // The customer already on the job. Going back to check a name is not a
    // change, and must not cost the chosen vehicle or the typed reading.
    if (next.id === customer?.id) {
      setPickingCustomer(false)
      continueRef.current?.focus()
      return
    }

    if (linesHoldWork) {
      setPendingCustomer(next)
      return
    }

    await switchCustomer(next)
    // One Tab and Enter from here, rather than scrolling past the list.
    continueRef.current?.focus()
  }

  /**
   * Consent is taken before the dialog opens, but nothing is discarded until a
   * customer actually exists to move to — cancelling the dialog leaves the job
   * exactly as it was.
   */
  function startNewCustomer() {
    if (linesHoldWork) {
      setPendingCustomer('new')
      return
    }
    setAddingCustomer(true)
  }

  /**
   * A confirmed change away from a job that has work on it. The old row is
   * thrown away rather than rewritten: moving it onto another customer would
   * make the job history say a visit happened that did not, and leaving it
   * behind would fill the resume list with jobs nobody intends to finish.
   *
   * Only ever an open job — this screen holds no other kind — and
   * `deleteOpenJob` carries that as a filter rather than trusting it.
   */
  async function discardAndSwitch(next: Customer | null) {
    const leaving = job
    setPendingCustomer(null)

    if (leaving) {
      const failure = await deleteOpenJob(leaving.id)
      if (failure) {
        setJobError(failure)
        return
      }
    }

    if (next === null) {
      // The add-customer path: nothing to move to yet, so the dialog opens
      // and its onSaved does the switch once a customer exists.
      setJob(null)
      setCustomer(null)
      clearJobState()
      setAddingCustomer(true)
      return
    }

    await switchCustomer(next, true)
  }

  /**
   * A different car for the same customer is the same work on a different
   * vehicle, so the lines stay — the services, prices and fluids are all still
   * right. Only the next-due pair was measured against the old car, and only
   * the half of it the app still owns is rewritten.
   */
  function chooseVehicle(vehicle: Vehicle | null) {
    const nextId = vehicle?.id ?? null
    // Re-picking what is already on the job. Not a change, so the reading
    // typed for this visit is left where it is. `vehicleChosen` is part of the
    // comparison because "not chosen yet" and "deliberately none" are both a
    // null id, and moving between them is a real change.
    if (vehicleChosen && nextId === vehicleId) {
      setPickingVehicle(false)
      continueRef.current?.focus()
      return
    }

    const reading = vehicle?.current_odometer ?? null
    setVehicleId(nextId)
    setVehicleChosen(true)
    setPickingVehicle(false)
    setOdometer(reading === null ? '' : String(reading))
    // Picking any vehicle answers the stranded-vehicle notice, including the
    // deliberate choice of none.
    setStrandedVehicle(null)
    // trg_move_reminders fires on this, and correctly does nothing: the lines
    // are still 'open', so no reminder exists to move.
    saveJob({ vehicle_id: nextId, odometer: reading })

    // The new car's own figures, not the memos, which are still holding the
    // old car's until this render lands.
    setLines((current) =>
      current.map((line) => {
        const service = serviceById.get(line.serviceId)
        return withDue(
          line,
          rederivedDue({
            service,
            interval: gradeInterval(
              service?.fluid_grade_list ?? null,
              line.fluid.grade,
            ),
            odometer: reading,
            kmPerDay: vehicle?.km_per_day ?? null,
            baseDate: todayIso(),
            line,
          }),
        )
      }),
    )

    continueRef.current?.focus()
  }

  /**
   * Arriving at the services step with nothing on the job opens a line
   * straight away — the empty state plus an Add line button is a wasted click
   * when adding a line is certain. Only once: if the user clears every line,
   * reopening on each removal would fight them.
   */
  function goToStep(next: number) {
    setStep(next)
    if (next === 2 && lines.length === 0 && !servicePickerOpened.current) {
      servicePickerOpened.current = true
      setPickingService('new')
    }
  }

  function resetForNextJob() {
    setStep(0)
    servicePickerOpened.current = false
    setCustomer(null)
    setCustomerQuery('')
    setPickingCustomer(true)
    setVehicleLoad(null)
    setVehicleId(null)
    setVehicleChosen(false)
    setPickingVehicle(false)
    setOdometer('')
    setLines([])
    setPaymentMethod('')
    setSavedJob(null)
    setSavedTotal(null)
    setSaveError(null)
    setJob(null)
    setJobError(null)
    setStrandedVehicle(null)
    setResumable(null)
    lineSync.current.signature.clear()
    lineSync.current.inFlight.clear()
    lineSync.current.removed.clear()
  }

  /**
   * The last action, and the only one that changes what the job means.
   *
   * Everything on screen is already on the server, so this is not a save. It
   * flushes whatever the debounce is still holding, writes the payment method
   * and reading one last time, then hands off to `completeJob` — which flips
   * the lines to 'done' before the job to 'completed', so the reminders fire
   * exactly once and only for a job that is actually finished.
   */
  async function handleComplete() {
    if (!customer || !job) return

    const parsedOdometer = parseOptionalInteger(odometer)
    if (parsedOdometer === 'invalid') {
      setSaveError(t('newJob.badOdometer'))
      return
    }

    setSaveError(null)
    setSaving(true)

    // Anything typed in the last few hundred milliseconds is still pending.
    const settled = await syncLines(job.id, lines)

    // A line whose row never landed would be completed without its work. The
    // sync above is the last chance, so this is checked rather than assumed —
    // against what it returned, not against the state it has only scheduled.
    const unwritten = settled.filter((line) => line.serviceId && line.id === null)
    if (unwritten.length > 0) {
      setSaveError(t('newJob.linesFailed', {
        number: job.job_no,
        reason: jobError ?? t('openJob.lineFailed'),
      }))
      setSaving(false)
      return
    }

    const completed = await completeJob(job.id, {
      vehicle_id: vehicleId,
      odometer: parsedOdometer,
      payment_method: paymentMethod || null,
    })

    if ('error' in completed) {
      setSaveError(completed.error)
      setSaving(false)
      return
    }

    setJob(null)
    setSavedJob(completed)

    // Totals live in the view, never on the job row.
    const { data: totals } = await supabase
      .from('v_job_totals')
      .select('total_with_tax')
      .eq('job_id', completed.id)
      .maybeSingle()

    setSavedTotal(totals?.total_with_tax ?? null)
    setSaving(false)
  }

  /**
   * Opens an existing open job into this screen.
   *
   * The vehicle is the awkward part. A job can carry a `vehicle_id` that is no
   * longer among this customer's vehicles — the car was moved to another
   * owner, or removed outright. Dropping the link silently would rewrite what
   * the job says without telling anybody, so the id is kept, the selection is
   * left unmade, and the screen says so.
   */
  async function resumeJob(row: Job) {
    setResuming(true)
    setJobError(null)

    const [customerResult, itemResult] = await Promise.all([
      supabase.from('customers').select('*').eq('id', row.customer_id).single(),
      supabase.from('job_items').select('*').eq('job_id', row.id).order('created_at'),
    ])

    if (customerResult.error || !customerResult.data) {
      setJobError(customerResult.error?.message ?? t('newJob.resumeLoadFailed'))
      setResuming(false)
      return
    }
    if (itemResult.error) {
      setJobError(itemResult.error.message)
      setResuming(false)
      return
    }

    lineSync.current.signature.clear()
    lineSync.current.inFlight.clear()
    lineSync.current.removed.clear()

    const restored: Line[] = (itemResult.data ?? []).map((item) => {
      const line: Line = {
        key: nextLineKey.current++,
        id: item.id,
        serviceId: item.service_id,
        partPrice: String(item.part_price ?? 0),
        laborPrice: String(item.labor_price ?? 0),
        subPrice: String(item.sub_price ?? 0),
        subcontractorId: item.subcontractor_id,
        nextDueKm: item.next_due_odometer === null ? '' : String(item.next_due_odometer),
        nextDueDate: item.next_due_date ?? '',
        // Written and left alone since: whatever is there was decided at the
        // counter, and resuming is not a fresh prefill.
        dueMark: DECIDED_DUE,
        fluid: fluidDraftFromDetails(item.details),
        tire: tireDraftFromDetails(item.details),
        details: item.details,
      }
      // Seeded as already-saved, so arriving on screen does not rewrite every
      // row it just read.
      lineSync.current.signature.set(line.key, lineSignature(line))
      return line
    })

    setJob(row)
    setCustomer(customerResult.data)
    setPickingCustomer(false)
    setPickingVehicle(false)
    setVehicleId(row.vehicle_id)
    setVehicleChosen(row.vehicle_id !== null)
    setOdometer(row.odometer === null ? '' : String(row.odometer))
    setPaymentMethod(row.payment_method ?? '')
    setLines(restored)
    setStrandedVehicle(row.vehicle_id)
    setResumable(null)
    servicePickerOpened.current = restored.length > 0
    setResuming(false)
    setStep(restored.length > 0 ? 2 : 1)
  }

  if (loading) return <p className="muted">Loading…</p>

  if (loadError) {
    return (
      <div className="card notice">
        <p>{t('newJob.loadFailed')}</p>
        <p className="muted">{loadError}</p>
      </div>
    )
  }

  if (savedJob && !saveError) {
    return (
      <div className="card notice notice--done">
        <p>
          <span dir="auto">
            {t('newJob.savedFor', {
              number: savedJob.job_no,
              customer: customer
                ? customerLabel(customer)
                : t('newJob.thisCustomer'),
            })}
          </span>
        </p>
        {savedTotal !== null && (
          <p className="muted">
            {t('newJob.savedTotal', { amount: money(savedTotal) })}
          </p>
        )}
        <button type="button" className="btn btn--dark btn--small" onClick={resetForNextJob}>
          {t('newJob.startAnother')}
        </button>
      </div>
    )
  }

  return (
    <>
      <nav className="stepper" aria-label={t('newJob.steps')}>
        {STEPS.map((labelKey, index) => (
          <button
            key={labelKey}
            type="button"
            className="stepper-step"
            aria-current={step === index ? 'step' : undefined}
            data-state={step === index ? 'current' : index < step ? 'done' : 'ahead'}
            // The customer alone is not enough: until the row exists nothing
            // on the later steps is being saved anywhere.
            disabled={index > 0 && (!customer || job === null)}
            onClick={() => goToStep(index)}
          >
            <span className="stepper-index num">{index + 1}</span>
            {t(labelKey)}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section className="step-panel">
          {resumable !== null && resumable.length > 0 && customer === null && (
            <ResumeStrip
              jobs={resumable}
              busy={resuming}
              onResume={resumeJob}
              onDismiss={() => setResumable([])}
            />
          )}

          {jobError !== null && job === null && customer !== null && (
            <div className="card notice confirm-panel">
              <p className="confirm-title">{t('newJob.jobCreateFailed')}</p>
              <p className="muted">{jobError}</p>
              <div className="confirm-row">
                <button
                  type="button"
                  className="btn btn--dark btn--small"
                  onClick={retryStartJob}
                  disabled={startingJob}
                >
                  {startingJob ? t('action.saving') : t('newJob.retryJob')}
                </button>
              </div>
            </div>
          )}

          {job !== null && (
            <p className="field-note figures" dir="auto">
              {t('newJob.jobOpened', { number: job.job_no })}
              {jobError !== null && (
                <>
                  {' '}
                  <span className="due-usage-error">
                    {t('newJob.jobSaveFailedInline')}
                  </span>
                </>
              )}
            </p>
          )}

          {customer && !pickingCustomer && (
            <div className="card chosen">
              <div>
                <div className="chosen-name" dir="auto">{customerLabel(customer)}</div>
                <div className="muted num">{customer.phone || t('common.noPhone')}</div>
              </div>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                onClick={() => setPickingCustomer(true)}
              >
                {t('action.change')}
              </button>
            </div>
          )}

          {pendingCustomer !== null && job !== null && (
            <CustomerChangeConfirm
              to={pendingCustomer}
              from={customer}
              jobNo={job.job_no}
              lines={linesWithWork}
              onCancel={() => setPendingCustomer(null)}
              onConfirm={() =>
                discardAndSwitch(pendingCustomer === 'new' ? null : pendingCustomer)
              }
            />
          )}

          <Collapsible open={pickingCustomer}>
            <div className="toolbar">
              <div className="toolbar-search">
                <input
                  className="input"
                  type="search"
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder={t('customers.search')}
                  aria-label={t('customers.searchLabel')}
                />
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={startNewCustomer}
              >
                {t('newJob.newCustomer')}
              </button>
            </div>

            {visibleCustomers.length === 0 ? (
              <p className="empty">
                {customers.length === 0
                  ? t('newJob.noCustomers')
                  : t('newJob.noCustomerMatch', { query: customerQuery.trim() })}
              </p>
            ) : (
              <div className="picker">
                {visibleCustomers.map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className="picker-row"
                    aria-pressed={customer?.id === row.id}
                    onClick={() => chooseCustomer(row)}
                  >
                    <span dir="auto">{customerLabel(row)}</span>
                    <span className="muted num">{row.phone || t('common.noPhone')}</span>
                  </button>
                ))}
              </div>
            )}
          </Collapsible>
        </section>
      )}

      {step === 1 && (
        <section className="step-panel">
          {vehiclesLoading ? (
            <p className="muted">{t('newJob.loadingVehicles')}</p>
          ) : (
            <>
              {vehicleChosen && !pickingVehicle && !vehicleUnresolved && (
                <div className="card chosen">
                  <div>
                    <div className="chosen-name num">
                      {selectedVehicle
                        ? vehicleLabel(selectedVehicle)
                        : t('newJob.noVehicleForJob')}
                    </div>
                    <div className="muted">
                      {selectedVehicle
                        ? describeVehicle(selectedVehicle)
                        : t('newJob.roadside')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => setPickingVehicle(true)}
                  >
                    {t('action.change')}
                  </button>
                </div>
              )}

              <Collapsible open={!vehicleChosen || pickingVehicle || vehicleUnresolved}>
                <div className="section-label">
                  <span>{t('newJob.stepVehicle')}</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setAddingVehicle(true)}
                  >
                    {t('newJob.addVehicle')}
                  </button>
                </div>

                <div className="picker">
                  {vehicles.map((vehicle) => (
                    <button
                      type="button"
                      key={vehicle.id}
                      className="picker-row"
                      aria-pressed={vehicleId === vehicle.id}
                      onClick={() => chooseVehicle(vehicle)}
                    >
                      <span className="num">{vehicleLabel(vehicle)}</span>
                      <span className="muted">{describeVehicle(vehicle)}</span>
                    </button>
                  ))}

                  {/* Not one of the cars — a different kind of answer, so it
                      sits apart rather than at the head of the list. */}
                  <button
                    type="button"
                    className="picker-row picker-row--none"
                    aria-pressed={vehicleChosen && vehicleId === null}
                    onClick={() => chooseVehicle(null)}
                  >
                    <span>{t('newJob.noVehicleForJob')}</span>
                    <span className="muted">{t('newJob.roadside')}</span>
                  </button>
                </div>
              </Collapsible>
            </>
          )}

          {vehicleUnresolved && (
            <p className="line-flag">{t('newJob.vehicleMissing')}</p>
          )}

          {vehicleId !== null && (
            <>
              <label className="field field--narrow">
                <span>
                  {t('newJob.odometerToday')}{' '}
                  <span className="field-hint">{t('common.km')}</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={odometer}
                  onChange={(event) => setOdometer(event.target.value)}
                  // On blur, not per keystroke: a half-typed reading is not a
                  // reading, and trg_bump_odometer would apply each one to the
                  // vehicle on its way past.
                  onBlur={() => {
                    const parsed = parseOptionalInteger(odometer)
                    if (parsed !== 'invalid') saveJob({ odometer: parsed })
                  }}
                  placeholder={t('vehicleForm.odometerPlaceholder')}
                />
              </label>
              {odometerWarning && (
                <p className="field-warning">{t(ODOMETER_WARNINGS[odometerWarning])}</p>
              )}
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="step-panel">
          <div className="section-label">
            <span>{t('newJob.stepServices')}</span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setAddingService(true)}
            >
              {t('newJob.newService')}
            </button>
          </div>

          {lines.length === 0 && <p className="empty">{t('newJob.noLines')}</p>}

          {lines.map((line) => {
            const service = serviceById.get(line.serviceId)
            const remindable = service?.triggers_reminder ?? false
            const hasDue =
              line.nextDueKm.trim() !== '' || line.nextDueDate.trim() !== ''
            const noReminder = remindable && !hasDue
            // The reminder trigger needs a vehicle; the vehicle step is optional.
            const wontCreate = remindable && hasDue && vehicleId === null

            // What the grade now on this line implies, recomputed each render
            // from the same inputs the prefill used. Null unless the chosen
            // value carries an interval, which today only oil grades do.
            const interval = gradeInterval(service?.fluid_grade_list ?? null, line.fluid.grade)
            const graded = gradeDue({
              service,
              interval,
              odometer: jobOdometer,
              kmPerDay,
              baseDate: todayIso(),
              line,
            })

            // Marked only where the app actually put something. An empty field
            // is the app's to fill but has nothing to advertise.
            const kmIsPrefill = line.dueMark.km && line.nextDueKm !== ''
            const dateIsPrefill = line.dueMark.date && line.nextDueDate !== ''


            return (
              <div className="card line" key={line.key}>
                <div className="line-main">
                  <div className="field">
                    <span>{t('jobEdit.service')}</span>
                    <button
                      type="button"
                      className="picker-trigger"
                      onClick={() => setPickingService(line.key)}
                    >
                      {service
                        ? localised(service.name_en, service.name_ar)
                        : t('newJob.chooseService')}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => removeLine(line)}
                  >
                    {t('action.remove')}
                  </button>
                </div>

                <PriceFields
                  partPrice={line.partPrice}
                  laborPrice={line.laborPrice}
                  subPrice={line.subPrice}
                  subcontractorId={line.subcontractorId}
                  onSubcontractorChange={(id) =>
                    updateLine(line.key, { subcontractorId: id })
                  }
                  onChange={(field, next) => updateLine(line.key, { [field]: next })}
                />

                {service && usesFluid(service) && (
                  <FluidFields
                    service={service}
                    draft={line.fluid}
                    onChange={(next) =>
                      updateLine(line.key, {
                        fluid: next,
                        // The interval belongs to the grade, so a new grade is a
                        // new prefill — for whichever fields are still the
                        // app's to write. Only on a change: editing the brand
                        // is not a reason to move a due date.
                        ...(next.grade === line.fluid.grade
                          ? {}
                          : regradeDue(
                              line,
                              gradeDue({
                                service,
                                interval: gradeInterval(
                                  service.fluid_grade_list,
                                  next.grade,
                                ),
                                odometer: jobOdometer,
                                kmPerDay,
                                baseDate: todayIso(),
                                line,
                              }),
                            )),
                      })
                    }
                  />
                )}

                {service && tracksTires(service) && (
                  <TireFields
                    draft={line.tire}
                    vehicleId={vehicleId}
                    onChange={(next) => updateLine(line.key, { tire: next })}
                  />
                )}

                {!line.serviceId && (
                  <p className="line-note muted">
                    {t('newJob.chooseServiceHint')}
                  </p>
                )}

                {remindable && (
                  <div className="line-reminder">
                    <div className="grid-2">
                      <label className="field">
                        <span>
                          {t('newJob.nextDueAt')}{' '}
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
                          value={line.nextDueKm}
                          onChange={(event) =>
                            updateLine(line.key, {
                              nextDueKm: event.target.value,
                              // Typed is decided: no later grade may rewrite it.
                              dueMark: { ...line.dueMark, km: false },
                            })
                          }
                          // The date is measured over the distance this field
                          // implies, so a new reading moves it — into the date
                          // only while that is still the app's. On blur rather
                          // than per keystroke: a half-typed reading is not a
                          // distance, and the date must not jump about while
                          // this one is being entered. `graded` is already
                          // recomputed from the committed value by the time
                          // this fires.
                          onBlur={() => {
                            const { nextDueDate } = regradeDue(line, graded)
                            if (nextDueDate !== undefined) {
                              updateLine(line.key, { nextDueDate })
                            }
                          }}
                        />
                        <OdometerHint
                          reference={odometerReference}
                          entered={line.nextDueKm}
                        />
                      </label>
                      <label className="field">
                        <span>
                          {t('newJob.nextDueBy')}
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
                          value={line.nextDueDate}
                          onChange={(event) =>
                            updateLine(line.key, {
                              nextDueDate: event.target.value,
                              dueMark: { ...line.dueMark, date: false },
                            })
                          }
                        />
                      </label>
                    </div>
                    {/* Shown whenever a grade with an interval is on the
                        line — the daily average it carries is a fact about
                        the car, not about whether this line's date has been
                        typed over. The hint itself decides what to say. */}
                    {graded && interval && (
                      <GradeDueHint
                        // label_en is NOT NULL, so it is always a real fallback.
                        grade={
                          localised(interval.label_en, interval.label_ar) ??
                          interval.label_en
                        }
                        intervalKm={interval.reminder_km}
                        intervalMonths={interval.reminder_months}
                        kmPerDay={kmPerDay}
                        due={graded}
                        enteredDate={line.nextDueDate}
                        // Every line here is unsaved, so every overridden date
                        // is one somebody typed a moment ago and can want back.
                        onUseComputed={() =>
                          updateLine(line.key, {
                            nextDueDate: graded.nextDueDate,
                            dueMark: { ...line.dueMark, date: true },
                          })
                        }
                        onSaveKmPerDay={onSaveKmPerDay}
                      />
                    )}
                    {noReminder && (
                      <p className="line-flag">
                        {t('newJob.noReminderBlank')}
                      </p>
                    )}
                    {wontCreate && (
                      <p className="line-flag">
                        {t('newJob.noReminderNoVehicle')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          <div className="block-actions">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setPickingService('new')}
            >
              {t('newJob.addLine')}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="step-panel">
          <label className="field field--narrow">
            <span>{t('newJob.paymentMethod')}</span>
            <select
              value={paymentMethod}
              onChange={(event) => {
                setPaymentMethod(event.target.value)
                saveJob({ payment_method: event.target.value || null })
              }}
              disabled={saving}
            >
              <option value="">{t('common.notRecorded')}</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.value} dir="auto">
                  {localised(method.label_en, method.label_ar)}
                </option>
              ))}
            </select>
          </label>

          <div className="section-label">
            <span>{t('newJob.summary')}</span>
          </div>

          <div className="card summary">
            <div className="summary-row">
              <span className="muted">{t('newJob.summaryCustomer')}</span>
              <span dir="auto">
                {customer ? customerLabel(customer) : t('newJob.emptyValue')}
              </span>
            </div>
            <div className="summary-row">
              <span className="muted">{t('newJob.summaryVehicle')}</span>
              <span className="num">
                {jobVehicleLabel(
                  vehicleId,
                  vehicles.find((row) => row.id === vehicleId),
                )}
              </span>
            </div>
            {jobOdometer !== null && (
              <div className="summary-row">
                <span className="muted">{t('newJob.summaryOdometer')}</span>
                <span className="num">
                  {km(jobOdometer)} {t('common.km')}
                </span>
              </div>
            )}

            {filledLines.length === 0 ? (
              <p className="summary-row muted">{t('newJob.noServiceLines')}</p>
            ) : (
              filledLines.map((line) => (
                <div className="summary-row" key={line.key}>
                  <span>
                    {(() => {
                      const line_service = serviceById.get(line.serviceId)
                      return (
                        (line_service &&
                          localised(line_service.name_en, line_service.name_ar)) ??
                        t('newJob.serviceFallback')
                      )
                    })()}
                  </span>
                  <span className="num">
                    {money(sumPrices(line.partPrice, line.laborPrice, line.subPrice))}
                  </span>
                </div>
              ))
            )}

            <div className="summary-row summary-total">
              <span>{t('newJob.linesTotal')}</span>
              <span className="num">{money(linesTotal)}</span>
            </div>
          </div>

          <p className="field-note">
            {t('newJob.taxNote')}
          </p>

          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      )}

      <div className="step-actions">
        {/* Step 1 has nowhere to go back to — re-opening the customer list is
            what Change does. */}
        {step > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => goToStep(step - 1)}
            disabled={saving}
          >
            {t('newJob.back')}
          </button>
        )}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn--dark"
            ref={continueRef}
            onClick={() => goToStep(step + 1)}
            disabled={!customer || job === null}
          >
            {t('newJob.continue')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--dark"
            onClick={handleComplete}
            disabled={saving || !customer || job === null}
          >
            {saving ? t('newJob.completing') : t('newJob.complete')}
          </button>
        )}
      </div>

      {step === 0 && !customer && (
        <p className="field-note">{t('newJob.pickCustomer')}</p>
      )}

      {addingCustomer && (
        <AddCustomerDialog
          onClose={() => setAddingCustomer(false)}
          onSaved={({ customer: created, vehicles: created_vehicles }) => {
            setCustomers((current) => [created, ...current])
            // A created customer is always a different one, so this is always
            // the full switch. `fresh` when the previous job was discarded on
            // the way here — cancelAndSwitch clears `job` first, so the flag
            // follows from whether one is still open.
            switchCustomer(created, job === null).then(() => {
              setVehicleLoad({ customerId: created.id, rows: created_vehicles })
            })
            setAddingCustomer(false)
          }}
        />
      )}

      {pickingService !== null && (
        <ServicePicker
          services={services}
          categories={categories}
          onClose={() => setPickingService(null)}
          onPick={(serviceId) => {
            if (pickingService === 'new') addLine(serviceId)
            else
              setLines((current) =>
                current.map((row) =>
                  row.key === pickingService ? applyService(row, serviceId) : row,
                ),
              )
            setPickingService(null)
          }}
        />
      )}

      {addingService && (
        <ServiceDialog
          categories={categories}
          onClose={() => setAddingService(false)}
          onSaved={(service) => {
            setServices((current) => [...current, service])
            setAddingService(false)
            // Drop straight into a line so the flow is not interrupted.
            addLine(service.id)
          }}
        />
      )}

      {addingVehicle && customer && (
        <AddVehicleDialog
          customerId={customer.id}
          onClose={() => setAddingVehicle(false)}
          onSaved={(vehicle) => {
            setVehicleLoad((current) =>
              current === null
                ? { customerId: vehicle.customer_id, rows: [vehicle] }
                : { ...current, rows: [...current.rows, vehicle] },
            )
            setVehicleId(vehicle.id)
            setVehicleChosen(true)
            setPickingVehicle(false)
            setOdometer(
              vehicle.current_odometer === null ? '' : String(vehicle.current_odometer),
            )
            setAddingVehicle(false)
          }}
        />
      )}
    </>
  )
}

/**
 * Consent before a customer change throws away entered lines.
 *
 * Same shape as the vehicle-change confirmation in Jobs: an inline amber
 * panel that names the consequence, not a modal. What it protects is not
 * undoable — this app has no undo — but it is also not dangerous, so it asks
 * once and gets out of the way.
 *
 * It fires on the customer id changing and on there being work to lose, and
 * on nothing else. It does not try to work out whether the two customers
 * share a car: no vehicle has been chosen for the incoming one yet, so there
 * is nothing to compare against, and the wording says what is true either way.
 */
/**
 * Jobs that were started and never finished, offered on arrival.
 *
 * Not resumed automatically, and not a dialog. The person at the counter is
 * the only one who knows whether the car in front of them is the car this job
 * was opened for, and starting a new job is the far commoner intent — so the
 * list sits above the customer picker and gets out of the way when ignored.
 */
function ResumeStrip({
  jobs,
  busy,
  onResume,
  onDismiss,
}: {
  jobs: ResumableJob[]
  busy: boolean
  onResume: (job: Job) => void
  onDismiss: () => void
}) {
  return (
    <div className="card notice resume-strip">
      <div className="resume-head">
        <p className="confirm-title">{t('newJob.resumeTitle')}</p>
        <button
          type="button"
          className="btn btn--quiet btn--small"
          onClick={onDismiss}
          disabled={busy}
        >
          {t('newJob.resumeDismiss')}
        </button>
      </div>
      <p className="muted">{tn(jobs.length, 'newJob.resumeCount')}</p>

      {jobs.map((row) => {
        const lines = row.job_items?.[0]?.count ?? 0
        return (
          <div className="resume-row" key={row.id}>
            <div>
              <div dir="auto">
                {t('newJob.jobNumber', { number: row.job_no })}
                {' \u00B7 '}
                {row.customers
                  ? customerLabel(row.customers)
                  : t('jobs.unknownCustomer')}
              </div>
              <div className="muted figures" dir="auto">
                {jobVehicleLabel(row.vehicle_id, row.vehicles)}
                {' \u00B7 '}
                {lines === 0 ? t('newJob.resumeNothing') : tn(lines, 'jobs.lines')}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => onResume(row)}
              disabled={busy}
            >
              {t('newJob.resumeAction')}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CustomerChangeConfirm({
  to,
  from,
  jobNo,
  lines,
  onCancel,
  onConfirm,
}: {
  to: Customer | 'new'
  from: Customer | null
  /** The job about to be thrown away, named so the confirmation can say which. */
  jobNo: number
  /** How many lines hold work. Never zero — the panel is not shown otherwise. */
  lines: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const fromLabel = from ? customerLabel(from) : t('newJob.thisCustomer')

  return (
    <div className="card notice confirm-panel">
      <p className="confirm-title" dir="auto">
        {to === 'new'
          ? t('newJob.changeCustomerNewTitle')
          : t('newJob.changeCustomerTitle', { customer: customerLabel(to) })}
      </p>

      <p dir="auto">
        {tn(lines, 'newJob.changeCustomerLines', {
          customer: fromLabel,
          number: jobNo,
        })}
      </p>
      <p className="field-note">{t('newJob.changeCustomerWhy')}</p>

      <div className="confirm-row">
        <button type="button" className="btn btn--dark btn--small" onClick={onConfirm}>
          {t('newJob.changeCustomerConfirm')}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={onCancel}>
          {t('action.cancel')}
        </button>
      </div>
    </div>
  )
}

function AddVehicleDialog({
  customerId,
  onClose,
  onSaved,
}: {
  customerId: string
  onClose: () => void
  onSaved: (vehicle: Vehicle) => void
}) {
  const [draft, setDraft] = useState<VehicleDraft>(emptyVehicleDraft())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isBlankVehicle(draft)) {
      setError(t('vehicleForm.needSomething'))
      return
    }

    const payload = vehicleInsertFrom(draft, customerId)
    if ('error' in payload) {
      setError(payload.error)
      return
    }

    setError(null)
    setSaving(true)

    const { data, error: insertError } = await supabase
      .from('vehicles')
      .insert(payload)
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? t('vehicleForm.saveFailed'))
      setSaving(false)
      return
    }

    onSaved(data)
  }

  return (
    <Dialog title={t('vehicleForm.newTitle')} onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <VehicleFields draft={draft} onChange={setDraft} disabled={saving} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving ? t('action.saving') : t('vehicleForm.save')}
        </button>
      </form>
    </Dialog>
  )
}
