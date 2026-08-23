import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import { todayIso } from './lib/date'
import { dueDefaults } from './lib/due'
import { customerLabel, matchesCustomerSearch } from './lib/customer'
import { jobVehicleLabel } from './lib/vehicle'
import { parseOptionalInteger, parseOptionalNumber } from './lib/parse'
import { ODOMETER_WARNINGS, useOdometerCheck } from './lib/odometer'
import Dialog from './components/Dialog'
import AddCustomerDialog from './components/AddCustomerDialog'
import AddServiceDialog from './components/AddServiceDialog'
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
  laborPrice: string
  nextDueKm: string
  nextDueDate: string
}

const STEPS = ['Customer', 'Vehicle', 'Services', 'Payment'] as const

function describeVehicle(vehicle: Vehicle): string {
  const spec = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ')
  return spec || 'No details recorded'
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

  // Tagged with the customer it belongs to, so a stale list is never shown
  // while a different customer's vehicles are still loading.
  const [vehicleLoad, setVehicleLoad] = useState<{
    customerId: string
    rows: Vehicle[]
  } | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [odometer, setOdometer] = useState('')
  const [addingVehicle, setAddingVehicle] = useState(false)

  const [lines, setLines] = useState<Line[]>([])
  const [addingService, setAddingService] = useState(false)
  const nextLineKey = useRef(1)

  const [paymentMethod, setPaymentMethod] = useState('')

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

    supabase
      .from('vehicles')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setSaveError(error.message)
        setVehicleLoad({ customerId, rows: data ?? [] })
      })

    return () => {
      cancelled = true
    }
  }, [customer])

  const vehiclesReady =
    customer !== null && vehicleLoad !== null && vehicleLoad.customerId === customer.id
  const vehicles = vehiclesReady ? vehicleLoad.rows : []
  const vehiclesLoading = customer !== null && !vehiclesReady

  const odometerWarning = useOdometerCheck(vehicleId, odometer)

  const jobOdometer = useMemo(() => {
    const parsed = parseOptionalInteger(odometer)
    return parsed === 'invalid' ? null : parsed
  }, [odometer])

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  )

  const visibleCustomers = useMemo(
    () => customers.filter((row) => matchesCustomerSearch(row, customerQuery)),
    [customers, customerQuery],
  )

  const filledLines = lines.filter((line) => line.serviceId !== '')

  const lineTotal = filledLines.reduce((sum, line) => {
    const parsed = parseOptionalNumber(line.laborPrice)
    return sum + (parsed === 'invalid' || parsed === null ? 0 : parsed)
  }, 0)

  /** Prefills come from the service's usual interval plus this job's readings. */
  function applyService(line: Line, serviceId: string): Line {
    const service = serviceById.get(serviceId)
    return {
      ...line,
      serviceId,
      laborPrice:
        service?.default_labor_price == null ? '' : String(service.default_labor_price),
      ...dueDefaults(service, jobOdometer, todayIso()),
    }
  }

  function addLine(serviceId = '') {
    const base: Line = {
      key: nextLineKey.current++,
      serviceId: '',
      laborPrice: '',
      nextDueKm: '',
      nextDueDate: '',
    }
    setLines((current) => [...current, serviceId ? applyService(base, serviceId) : base])
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  function resetForNextJob() {
    setStep(0)
    setCustomer(null)
    setCustomerQuery('')
    setVehicleLoad(null)
    setVehicleId(null)
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
      setSaveError('Odometer must be a whole number, or left blank.')
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
        setSaveError(error?.message ?? 'The job could not be saved.')
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
          const price = parseOptionalNumber(line.laborPrice)
          const dueKm = parseOptionalInteger(line.nextDueKm)
          return {
            job_id: job.id,
            service_id: line.serviceId,
            labor_price: price === 'invalid' || price === null ? 0 : price,
            next_due_odometer: dueKm === 'invalid' ? null : dueKm,
            next_due_date: line.nextDueDate || null,
            status: 'done' as const,
          }
        }),
      )

      if (error) {
        setSaveError(
          `Job #${job.job_no} was created, but its lines could not be saved: ${error.message}. Submit again to retry the lines.`,
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
        <p>Could not load what this screen needs.</p>
        <p className="muted">{loadError}</p>
      </div>
    )
  }

  if (savedJob && !saveError) {
    return (
      <div className="card notice notice--done">
        <p>
          Job <span className="num">#{savedJob.job_no}</span> saved for{' '}
          <span dir="auto">{customer ? customerLabel(customer) : 'this customer'}</span>.
        </p>
        {savedTotal !== null && (
          <p className="muted">
            Total <span className="num">{money(savedTotal)}</span> — from the job
            totals view.
          </p>
        )}
        <button type="button" className="btn btn--dark btn--small" onClick={resetForNextJob}>
          Start another job
        </button>
      </div>
    )
  }

  return (
    <>
      <nav className="stepper" aria-label="Job steps">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className="stepper-step"
            aria-current={step === index ? 'step' : undefined}
            data-state={step === index ? 'current' : index < step ? 'done' : 'ahead'}
            disabled={index > 0 && !customer}
            onClick={() => setStep(index)}
          >
            <span className="stepper-index num">{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section className="step-panel">
          <div className="toolbar">
            <div className="toolbar-search">
              <input
                className="input"
                type="search"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search by name or phone"
                aria-label="Search customers"
              />
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setAddingCustomer(true)}
            >
              New customer
            </button>
          </div>

          {visibleCustomers.length === 0 ? (
            <p className="empty">
              {customers.length === 0
                ? 'No customers yet.'
                : `No customer matches “${customerQuery.trim()}”.`}
            </p>
          ) : (
            <div className="picker">
              {visibleCustomers.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className="picker-row"
                  aria-pressed={customer?.id === row.id}
                  onClick={() => {
                    setCustomer(row)
                    setVehicleId(null)
                    setOdometer('')
                  }}
                >
                  <span dir="auto">{customerLabel(row)}</span>
                  <span className="muted num">{row.phone || 'No phone'}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="step-panel">
          <div className="section-label">
            <span>Vehicle</span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setAddingVehicle(true)}
            >
              Add vehicle
            </button>
          </div>

          {vehiclesLoading ? (
            <p className="muted">Loading vehicles…</p>
          ) : (
            <div className="picker">
              <button
                type="button"
                className="picker-row"
                aria-pressed={vehicleId === null}
                onClick={() => {
                  setVehicleId(null)
                  setOdometer('')
                }}
              >
                <span>No vehicle for this job</span>
                <span className="muted">Roadside or counter sale</span>
              </button>

              {vehicles.map((vehicle) => (
                <button
                  type="button"
                  key={vehicle.id}
                  className="picker-row"
                  aria-pressed={vehicleId === vehicle.id}
                  onClick={() => {
                    setVehicleId(vehicle.id)
                    setOdometer(
                      vehicle.current_odometer === null
                        ? ''
                        : String(vehicle.current_odometer),
                    )
                  }}
                >
                  <span className="num">{vehicle.plate || 'No plate'}</span>
                  <span className="muted">{describeVehicle(vehicle)}</span>
                </button>
              ))}
            </div>
          )}

          {vehicleId !== null && (
            <>
              <label className="field field--narrow">
                <span>
                  Odometer today <span className="field-hint">km</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={odometer}
                  onChange={(event) => setOdometer(event.target.value)}
                  placeholder="84210"
                />
              </label>
              {odometerWarning && (
                <p className="field-warning">{ODOMETER_WARNINGS[odometerWarning]}</p>
              )}
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="step-panel">
          <div className="section-label">
            <span>Services</span>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setAddingService(true)}
            >
              New service
            </button>
          </div>

          {lines.length === 0 && <p className="empty">No lines yet.</p>}

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
                  <label className="field">
                    <span>Service</span>
                    <select
                      value={line.serviceId}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((row) =>
                            row.key === line.key
                              ? applyService(row, event.target.value)
                              : row,
                          ),
                        )
                      }
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

                  <label className="field field--narrow">
                    <span>Labour</span>
                    <input
                      className="num"
                      inputMode="decimal"
                      value={line.laborPrice}
                      onChange={(event) =>
                        updateLine(line.key, { laborPrice: event.target.value })
                      }
                      placeholder="0.000"
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() =>
                      setLines((current) => current.filter((row) => row.key !== line.key))
                    }
                  >
                    Remove
                  </button>
                </div>

                {!line.serviceId && (
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
                          value={line.nextDueKm}
                          onChange={(event) =>
                            updateLine(line.key, { nextDueKm: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Next due by</span>
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
                        Both due fields are empty, so no reminder will be created for
                        this line.
                      </p>
                    )}
                    {wontCreate && (
                      <p className="line-flag">
                        No vehicle was picked for this job, so no reminder will be
                        created. Go back to the vehicle step to add one.
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
              onClick={() => addLine()}
            >
              Add line
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="step-panel">
          <label className="field field--narrow">
            <span>Payment method</span>
            <select
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              disabled={saving}
            >
              <option value="">Not recorded</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.value} dir="auto">
                  {method.label_ar
                    ? `${method.label_en} · ${method.label_ar}`
                    : method.label_en}
                </option>
              ))}
            </select>
          </label>

          <div className="section-label">
            <span>Summary</span>
          </div>

          <div className="card summary">
            <div className="summary-row">
              <span className="muted">Customer</span>
              <span dir="auto">{customer ? customerLabel(customer) : '—'}</span>
            </div>
            <div className="summary-row">
              <span className="muted">Vehicle</span>
              <span className="num">
                {jobVehicleLabel(
                  vehicleId,
                  vehicles.find((row) => row.id === vehicleId),
                )}
              </span>
            </div>
            {jobOdometer !== null && (
              <div className="summary-row">
                <span className="muted">Odometer</span>
                <span className="num">{km(jobOdometer)} km</span>
              </div>
            )}

            {filledLines.length === 0 ? (
              <p className="summary-row muted">No service lines.</p>
            ) : (
              filledLines.map((line) => (
                <div className="summary-row" key={line.key}>
                  <span>{serviceById.get(line.serviceId)?.name_en ?? 'Service'}</span>
                  <span className="num">
                    {money(
                      (() => {
                        const parsed = parseOptionalNumber(line.laborPrice)
                        return parsed === 'invalid' || parsed === null ? 0 : parsed
                      })(),
                    )}
                  </span>
                </div>
              ))
            )}

            <div className="summary-row summary-total">
              <span>Labour total</span>
              <span className="num">{money(lineTotal)}</span>
            </div>
          </div>

          <p className="field-note">
            Parts and tax are not included here — the saved total comes from the
            job totals view.
          </p>

          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      )}

      <div className="step-actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setStep((current) => current - 1)}
          disabled={step === 0 || saving}
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn--dark"
            onClick={() => setStep((current) => current + 1)}
            disabled={!customer}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--dark"
            onClick={handleSave}
            disabled={saving || !customer}
          >
            {saving ? 'Saving…' : savedJob ? 'Retry lines' : 'Save job'}
          </button>
        )}
      </div>

      {step === 0 && !customer && (
        <p className="field-note">Pick a customer to continue.</p>
      )}

      {addingCustomer && (
        <AddCustomerDialog
          onClose={() => setAddingCustomer(false)}
          onSaved={({ customer: created, vehicles: created_vehicles }) => {
            setCustomers((current) => [created, ...current])
            setCustomer(created)
            setVehicleLoad({ customerId: created.id, rows: created_vehicles })
            setAddingCustomer(false)
          }}
        />
      )}

      {addingService && (
        <AddServiceDialog
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
      setError('Fill in at least one field.')
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
      setError(insertError?.message ?? 'The vehicle could not be saved.')
      setSaving(false)
      return
    }

    onSaved(data)
  }

  return (
    <Dialog title="New vehicle" onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <VehicleFields draft={draft} onChange={setDraft} disabled={saving} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving ? 'Saving…' : 'Save vehicle'}
        </button>
      </form>
    </Dialog>
  )
}
