import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import { todayIso } from './lib/date'
import { dueDefaults } from './lib/due'
import { emptyFluidDraft, usesFluid } from './lib/fluid'
import { lineDetails } from './lib/lineDetails'
import type { FluidDraft } from './lib/fluid'
import { emptyTireDraft, tracksTires } from './lib/tire'
import type { TireDraft } from './lib/tire'
import { customerLabel, matchesCustomerSearch } from './lib/customer'
import { jobVehicleLabel, vehicleLabel } from './lib/vehicle'
import { parseOptionalInteger, priceValue, sumPrices } from './lib/parse'
import { ODOMETER_WARNINGS, useOdometerCheck } from './lib/odometer'
import Collapsible from './components/Collapsible'
import ServicePicker from './components/ServicePicker'
import { localised, t } from './lib/i18n'
import type { StringKey } from './lib/i18n'
import Dialog from './components/Dialog'
import PriceFields from './components/PriceFields'
import FluidFields from './components/FluidFields'
import TireFields from './components/TireFields'
import OdometerHint from './components/OdometerHint'
import type { OdometerReference } from './components/OdometerHint'
import AddCustomerDialog from './components/AddCustomerDialog'
import ServiceDialog from './components/ServiceDialog'
import VehicleFields from './components/VehicleFields'
import {
  emptyVehicleDraft,
  isBlankVehicle,
  vehicleInsertFrom,
} from './lib/vehicle'
import type { VehicleDraft } from './lib/vehicle'

type Customer = Database['public']['Tables']['customers']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']
type Job = Database['public']['Tables']['jobs']['Row']
type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']
type PaymentMethod = Database['public']['Tables']['lookup_values']['Row']

type Line = {
  key: number
  serviceId: string
  partPrice: string
  laborPrice: string
  subPrice: string
  nextDueKm: string
  nextDueDate: string
  fluid: FluidDraft
  tire: TireDraft
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

export default function NewJob() {
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

  const continueRef = useRef<HTMLButtonElement>(null)
  const servicePickerOpened = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedJob, setSavedJob] = useState<Job | null>(null)
  const [savedTotal, setSavedTotal] = useState<number | null>(null)

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

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )

  const visibleCustomers = useMemo(
    () => customers.filter((row) => matchesCustomerSearch(row, customerQuery)),
    [customers, customerQuery],
  )

  const filledLines = lines.filter((line) => line.serviceId !== '')

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
      // A different service means different consumables, so start clean.
      fluid: emptyFluidDraft(),
      tire: emptyTireDraft(),
      ...dueDefaults(service, jobOdometer, todayIso()),
    }
  }

  function addLine(serviceId = '') {
    const base: Line = {
      key: nextLineKey.current++,
      serviceId: '',
      partPrice: '',
      laborPrice: '',
      subPrice: '',
      nextDueKm: '',
      nextDueDate: '',
      fluid: emptyFluidDraft(),
      tire: emptyTireDraft(),
    }
    setLines((current) => [...current, serviceId ? applyService(base, serviceId) : base])
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  const selectedVehicle = vehicles.find((row) => row.id === vehicleId) ?? null

  function chooseCustomer(next: Customer) {
    setCustomer(next)
    setPickingCustomer(false)
    setVehicleId(null)
    setVehicleChosen(false)
    setOdometer('')
    // One Tab and Enter from here, rather than scrolling past the list.
    continueRef.current?.focus()
  }

  function chooseVehicle(vehicle: Vehicle | null) {
    setVehicleId(vehicle?.id ?? null)
    setVehicleChosen(true)
    setPickingVehicle(false)
    setOdometer(
      vehicle?.current_odometer == null ? '' : String(vehicle.current_odometer),
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
  }

  async function handleSave() {
    if (!customer) return

    const parsedOdometer = parseOptionalInteger(odometer)
    if (parsedOdometer === 'invalid') {
      setSaveError(t('newJob.badOdometer'))
      return
    }

    setSaveError(null)
    setSaving(true)

    let job = savedJob
    if (!job) {
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          customer_id: customer.id,
          vehicle_id: vehicleId,
          odometer: parsedOdometer,
          payment_method: paymentMethod || null,
          status: 'completed',
        })
        .select()
        .single()

      if (error || !data) {
        setSaveError(error?.message ?? t('newJob.jobSaveFailed'))
        setSaving(false)
        return
      }
      job = data
      setSavedJob(data)
    }

    if (filledLines.length > 0) {
      // The trigger turns next_due_* into reminders — the app never writes to
      // the reminders table itself.
      const { error } = await supabase.from('job_items').insert(
        filledLines.map((line) => {
          const dueKm = parseOptionalInteger(line.nextDueKm)
          return {
            job_id: job.id,
            details: lineDetails({}, line.fluid, line.tire),
            service_id: line.serviceId,
            part_price: priceValue(line.partPrice),
            labor_price: priceValue(line.laborPrice),
            sub_price: priceValue(line.subPrice),
            next_due_odometer: dueKm === 'invalid' ? null : dueKm,
            next_due_date: line.nextDueDate || null,
            status: 'done' as const,
          }
        }),
      )

      if (error) {
        setSaveError(
          t('newJob.linesFailed', {
            number: job.job_no,
            reason: error.message,
          }),
        )
        setSaving(false)
        return
      }
    }

    // Totals live in the view, never on the job row.
    const { data: totals } = await supabase
      .from('v_job_totals')
      .select('total_with_tax')
      .eq('job_id', job.id)
      .maybeSingle()

    setSavedTotal(totals?.total_with_tax ?? null)
    setSaving(false)
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
            disabled={index > 0 && !customer}
            onClick={() => goToStep(index)}
          >
            <span className="stepper-index num">{index + 1}</span>
            {t(labelKey)}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section className="step-panel">
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
                onClick={() => setAddingCustomer(true)}
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
              {vehicleChosen && !pickingVehicle && (
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

              <Collapsible open={!vehicleChosen || pickingVehicle}>
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
                    onClick={() =>
                      setLines((current) => current.filter((row) => row.key !== line.key))
                    }
                  >
                    {t('action.remove')}
                  </button>
                </div>

                <PriceFields
                  partPrice={line.partPrice}
                  laborPrice={line.laborPrice}
                  subPrice={line.subPrice}
                  onChange={(field, next) => updateLine(line.key, { [field]: next })}
                />

                {service && usesFluid(service) && (
                  <FluidFields
                    service={service}
                    draft={line.fluid}
                    onChange={(next) => updateLine(line.key, { fluid: next })}
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
                        </span>
                        <input
                          className="num"
                          inputMode="numeric"
                          value={line.nextDueKm}
                          onChange={(event) =>
                            updateLine(line.key, { nextDueKm: event.target.value })
                          }
                        />
                        <OdometerHint
                          reference={odometerReference}
                          entered={line.nextDueKm}
                        />
                      </label>
                      <label className="field">
                        <span>{t('newJob.nextDueBy')}</span>
                        <input
                          className="num"
                          type="date"
                          value={line.nextDueDate}
                          onChange={(event) =>
                            updateLine(line.key, { nextDueDate: event.target.value })
                          }
                        />
                      </label>
                    </div>
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
              onChange={(event) => setPaymentMethod(event.target.value)}
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
            disabled={!customer}
          >
            {t('newJob.continue')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--dark"
            onClick={handleSave}
            disabled={saving || !customer}
          >
            {saving
              ? t('action.saving')
              : savedJob
                ? t('newJob.retryLines')
                : t('newJob.save')}
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
            setCustomer(created)
            setPickingCustomer(false)
            setVehicleLoad({ customerId: created.id, rows: created_vehicles })
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
