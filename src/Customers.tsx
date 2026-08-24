import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import Dialog from './components/Dialog'
import AddCustomerDialog from './components/AddCustomerDialog'
import EditCustomerDialog from './components/EditCustomerDialog'
import VehicleDialog from './components/VehicleDialog'
import MuteDialog from './components/MuteDialog'
import type { MutableService } from './components/MuteDialog'
import { customerLabel, matchesCustomerSearch } from './lib/customer'
import { useLookup } from './lib/useLookup'
import { vehicleLabel } from './lib/vehicle'
import {
  CONTACT_FILTERS,
  CONTACT_PROBLEM_LABELS,
  contactProblem,
  matchesContactFilter,
} from './lib/contactHealth'
import { localised, t, tn } from './lib/i18n'
import type { ContactFilter, ContactHealth } from './lib/contactHealth'

type Customer = Database['public']['Tables']['customers']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']
type Job = Database['public']['Tables']['jobs']['Row']
type Mute = Database['public']['Views']['v_customer_mutes']['Row']
type Staff = Database['public']['Tables']['staff']['Row']

type CustomerListItem = Customer & { vehicleCount: number; jobCount: number }

export default function Customers({
  staff,
  focusCustomerId,
  onFocusHandled,
}: {
  staff: Staff
  /** Set when another screen linked straight to one customer. */
  focusCustomerId?: string | null
  onFocusHandled?: () => void
}) {
  // Captured at mount: this screen is mounted by the tab switch that carries
  // the link, and re-reading it would refetch the whole list on clear.
  const focusOnMount = useRef(focusCustomerId ?? null)
  const notifyFocusHandled = useRef(onFocusHandled)

  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [health, setHealth] = useState<Map<string, ContactHealth>>(new Map())
  const [fleetMakes, setFleetMakes] = useState<string[]>([])
  const [makesByCustomer, setMakesByCustomer] = useState<Map<string, Set<string>>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [query, setQuery] = useState('')
  const [makeFilter, setMakeFilter] = useState('')
  const [contactFilter, setContactFilter] = useState<ContactFilter>('')
  // Display only. v_fleet_by_make aggregates vehicles.make, which holds the
  // English label and nothing else, so the Arabic name has to come back from
  // the lookup list the label was picked from.
  const makeList = useLookup('vehicle_make')
  const [openCustomer, setOpenCustomer] = useState<CustomerListItem | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Counted in Postgres rather than by pulling every vehicle and job row.
      const [customerResult, healthResult, fleetResult, vehicleResult] =
        await Promise.all([
          supabase
            .from('customers')
            .select('*, vehicles(count), jobs(count)')
            .order('created_at', { ascending: false }),
          supabase.from('v_customer_contact_health').select('*'),
          // Only makes actually in the fleet, commonest first.
          supabase
            .from('v_fleet_by_make')
            .select('make, vehicles')
            .order('vehicles', { ascending: false }),
          supabase.from('vehicles').select('customer_id, make'),
        ])

      if (cancelled) return

      const loadError =
        customerResult.error ??
        healthResult.error ??
        fleetResult.error ??
        vehicleResult.error
      if (loadError) {
        setError(loadError.message)
        setLoading(false)
        return
      }

      setFleetMakes(
        (fleetResult.data ?? []).flatMap((row) => (row.make ? [row.make] : [])),
      )

      const byCustomer = new Map<string, Set<string>>()
      for (const row of vehicleResult.data ?? []) {
        if (!row.make) continue
        const existing = byCustomer.get(row.customer_id)
        if (existing) existing.add(row.make)
        else byCustomer.set(row.customer_id, new Set([row.make]))
      }
      setMakesByCustomer(byCustomer)

      const data = customerResult.data
      setHealth(
        new Map(
          (healthResult.data ?? []).flatMap((row) =>
            row.customer_id ? [[row.customer_id, row] as const] : [],
          ),
        ),
      )

      const list = (data ?? []).map(({ vehicles, jobs, ...customer }) => ({
        ...customer,
        vehicleCount: vehicles[0]?.count ?? 0,
        jobCount: jobs[0]?.count ?? 0,
      }))
      setCustomers(list)

      const focusId = focusOnMount.current
      if (focusId) {
        const focused = list.find((row) => row.id === focusId)
        if (focused) setOpenCustomer(focused)
        notifyFocusHandled.current?.()
      }

      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  /**
   * v_customer_contact_health derives no_phone and no_opt_in from the customer
   * row, so editing either leaves the amber flag contradicting the pill beside
   * it until a reload. The pill reads the column, the flag reads the view —
   * two sources for one fact, and only one of them was being refreshed.
   *
   * One row rather than the whole view: the edit touched one customer.
   */
  const refreshHealth = useCallback(async (customerId: string) => {
    const { data, error } = await supabase
      .from('v_customer_contact_health')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle()

    if (error) {
      // The flag stays as it was rather than disappearing on a failed read.
      console.error('Could not refresh contact health', error)
      return
    }

    setHealth((current) => {
      const next = new Map(current)
      // No row is an answer, not a miss — drop the stale one rather than
      // leaving a flag the view no longer reports.
      if (data) next.set(customerId, data)
      else next.delete(customerId)
      return next
    })
  }, [])

  const visible = useMemo(
    () =>
      customers.filter(
        (customer) =>
          matchesCustomerSearch(customer, query) &&
          (!makeFilter || makesByCustomer.get(customer.id)?.has(makeFilter) === true) &&
          matchesContactFilter(health.get(customer.id), contactFilter),
      ),
    [customers, query, makeFilter, contactFilter, makesByCustomer, health],
  )

  const filtering = Boolean(query.trim() || makeFilter || contactFilter)

  function clearFilters() {
    setQuery('')
    setMakeFilter('')
    setContactFilter('')
  }

  // Keyed on label_en because that is what vehicles.make stores. Locale is
  // applied at render rather than baked in here, so switching language does
  // not need the map rebuilt.
  const makeRows = useMemo(
    () => new Map(makeList.map((row) => [row.label_en, row] as const)),
    [makeList],
  )

  /** Never changes what is matched on — only what is read. */
  function makeLabel(make: string): string {
    const row = makeRows.get(make)
    return (row && localised(row.label_en, row.label_ar)) || make
  }

  if (loading) {
    return <p className="muted">{t('customers.loading')}</p>
  }

  if (error) {
    return (
      <div className="card notice">
        <p>{t('customers.loadFailed')}</p>
        <p className="muted">{error}</p>
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
    )
  }

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-search">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('customers.search')}
            aria-label={t('customers.searchLabel')}
          />
        </div>
        <label className="field toolbar-field">
          <span>{t('customers.make')}</span>
          <select
            value={makeFilter}
            onChange={(event) => setMakeFilter(event.target.value)}
          >
            <option value="">{t('customers.anyMake')}</option>
            {fleetMakes.map((make) => (
              <option key={make} value={make}>
                {makeLabel(make)}
              </option>
            ))}
          </select>
        </label>
        <label className="field toolbar-field">
          <span>{t('customers.contact')}</span>
          <select
            value={contactFilter}
            onChange={(event) =>
              setContactFilter(event.target.value as ContactFilter)
            }
          >
            {CONTACT_FILTERS.map(({ value, labelKey }) => (
              <option key={value || 'any'} value={value}>
                {t(labelKey)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn--dark toolbar-action"
          onClick={() => setAdding(true)}
        >
          {t('customers.add')}
        </button>
      </div>

      {customers.length === 0 ? (
        <p className="empty">{t('customers.none')}</p>
      ) : visible.length === 0 ? (
        <div className="empty">
          {/* Three filters is eight combinations; naming each in prose was
              already awkward with two. The way out is more use than the
              sentence. */}
          <p>{t('customers.noneMatch')}</p>
          {filtering && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={clearFilters}
            >
              {t('common.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="customer-grid">
          {visible.map((customer) => (
            <button
              type="button"
              className="card customer-card"
              key={customer.id}
              onClick={() => setOpenCustomer(customer)}
            >
              <div className="customer-head">
                <span className="customer-name" dir="auto">
                  {customerLabel(customer)}
                </span>
                {customer.whatsapp_opt_in ? (
                  <span className="pill pill--green">{t('customers.optedIn')}</span>
                ) : (
                  <span className="pill pill--amber">{t('customers.notOptedIn')}</span>
                )}
              </div>

              <div className="customer-phone num">
                {customer.phone || t('common.noPhone')}
              </div>

              {(() => {
                // Consent and deliverability are different things, so the flag
                // is styled apart from the opt-in pill above.
                const problem = contactProblem(health.get(customer.id))
                return problem ? (
                  <div className={`flag flag--${problem}`}>
                    {t(CONTACT_PROBLEM_LABELS[problem])}
                  </div>
                ) : null
              })()}

              <div className="customer-counts">
                {tn(customer.vehicleCount, 'customers.vehicles')}{' '}
                · {tn(customer.jobCount, 'customers.jobs')}
              </div>
            </button>
          ))}
        </div>
      )}

      {openCustomer && (
        <CustomerDetail
          customer={openCustomer}
          staff={staff}
          onClose={() => setOpenCustomer(null)}
          onCustomerChanged={(updated) => {
            setCustomers((current) =>
              current.map((row) =>
                row.id === updated.id ? { ...row, ...updated } : row,
              ),
            )
            setOpenCustomer((current) =>
              current && current.id === updated.id
                ? { ...current, ...updated }
                : current,
            )
            refreshHealth(updated.id)
          }}
          health={health.get(openCustomer.id)}
          onVehicleAdded={() => {
            setCustomers((current) =>
              current.map((row) =>
                row.id === openCustomer.id
                  ? { ...row, vehicleCount: row.vehicleCount + 1 }
                  : row,
              ),
            )
          }}
        />
      )}

      {adding && (
        <AddCustomerDialog
          onClose={() => setAdding(false)}
          onSaved={({ customer, vehicles }) => {
            setCustomers((current) => [
              { ...customer, vehicleCount: vehicles.length, jobCount: 0 },
              ...current,
            ])
            // Nothing in the map for a customer that did not exist when the
            // page loaded, so a new one with no phone showed no flag at all.
            refreshHealth(customer.id)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}

/* Detail panel --------------------------------------------------------- */

type PendingReminder = {
  id: string
  service_id: string
  due_date: string | null
  due_odometer: number | null
  services: { name_en: string; name_ar: string | null } | null
}

type VehicleWithReminders = Vehicle & { reminders: PendingReminder[] }

function CustomerDetail({
  customer,
  staff,
  health,
  onClose,
  onCustomerChanged,
  onVehicleAdded,
}: {
  customer: CustomerListItem
  staff: Staff
  health: ContactHealth | undefined
  onClose: () => void
  onCustomerChanged: (customer: Customer) => void
  onVehicleAdded: () => void
}) {
  const [vehicles, setVehicles] = useState<VehicleWithReminders[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [totals, setTotals] = useState<Map<string, number | null>>(new Map())
  const [mutes, setMutes] = useState<Mute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [editing, setEditing] = useState(false)
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [muting, setMuting] = useState(false)
  const [unmutingId, setUnmutingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Reminders hang off vehicles, not customers, so they ride along with
      // the vehicle query instead of costing a second round trip.
      const [vehicleResult, jobResult, muteResult] = await Promise.all([
        supabase
          .from('vehicles')
          .select(
            '*, reminders(id, service_id, due_date, due_odometer, services(name_en, name_ar))',
          )
          .eq('customer_id', customer.id)
          .eq('reminders.status', 'pending')
          .order('created_at'),
        supabase
          .from('jobs')
          .select('*')
          .eq('customer_id', customer.id)
          .order('start_date', { ascending: false })
          .order('job_no', { ascending: false }),
        supabase
          .from('v_customer_mutes')
          .select('*')
          .eq('customer_id', customer.id)
          .order('muted_at', { ascending: false }),
      ])

      if (cancelled) return

      const failure = vehicleResult.error ?? jobResult.error ?? muteResult.error
      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      const loadedJobs = jobResult.data ?? []
      setVehicles(vehicleResult.data ?? [])
      setJobs(loadedJobs)
      setMutes(muteResult.data ?? [])

      // v_job_totals carries no customer_id, so it can only be keyed by job.
      if (loadedJobs.length > 0) {
        const { data, error: totalsError } = await supabase
          .from('v_job_totals')
          .select('job_id, total_with_tax')
          .in(
            'job_id',
            loadedJobs.map((job) => job.id),
          )

        if (cancelled) return

        if (totalsError) {
          setError(totalsError.message)
        } else {
          setTotals(
            new Map(
              (data ?? []).flatMap((row) =>
                row.job_id ? [[row.job_id, row.total_with_tax] as const] : [],
              ),
            ),
          )
        }
      }

      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [customer.id, reloadToken])

  const pendingReminders = useMemo(
    () =>
      vehicles
        .flatMap((vehicle) =>
          vehicle.reminders.map((reminder) => ({ reminder, vehicle })),
        )
        // Undated reminders are odometer-driven, so they sort last.
        .sort((a, b) =>
          (a.reminder.due_date ?? '9999-12-31').localeCompare(
            b.reminder.due_date ?? '9999-12-31',
          ),
        ),
    [vehicles],
  )

  async function unmute(id: string) {
    setUnmutingId(id)
    const { error: deleteError } = await supabase
      .from('reminder_mutes')
      .delete()
      .eq('id', id)
    setUnmutingId(null)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setReloadToken((token) => token + 1)
  }

  // Only services with a live pending reminder can usefully be muted, and
  // muting one twice is a no-op, so anything already muted drops out.
  const mutableServices = useMemo(() => {
    const alreadyMuted = new Set(
      mutes.flatMap((mute) => (mute.service_id === null ? [] : [mute.service_id])),
    )

    const distinct = new Map<string, MutableService>()
    for (const { reminder } of pendingReminders) {
      if (alreadyMuted.has(reminder.service_id)) continue
      if (distinct.has(reminder.service_id)) continue
      distinct.set(reminder.service_id, {
        id: reminder.service_id,
        name:
          localised(reminder.services?.name_en, reminder.services?.name_ar) ??
          t('detail.unknownService'),
      })
    }

    return [...distinct.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [pendingReminders, mutes])

  return (
    <Dialog wide title={customerLabel(customer)} onClose={onClose}>
      <div className="detail-lede">
        <div className="detail-head">
          <div>
            <div className="detail-phone num">
              {customer.phone || t('detail.noPhoneOnFile')}
            </div>
            <div className="detail-since">
              {t('detail.since', { date: customer.created_at.slice(0, 10) })}
              {customer.source ? ` · ${customer.source}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setEditing(true)}
          >
            {t('action.edit')}
          </button>
        </div>

        <div className="badge-row">
          {customer.whatsapp_opt_in ? (
            <span className="pill pill--green">{t('detail.optedInWhatsApp')}</span>
          ) : (
            <span className="pill pill--amber">{t('detail.noOptIn')}</span>
          )}
          {customer.is_periodic && <span className="pill">{t('detail.periodic')}</span>}
        </div>

        {(() => {
          const problem = contactProblem(health)
          if (!problem) return null
          return (
            <div className={`flag flag--block flag--${problem}`}>
              <div className="flag-title">{t(CONTACT_PROBLEM_LABELS[problem])}</div>
              <div className="flag-detail figures" dir="auto">
                {health?.failed_sends ? (
                  <>
                    {tn(health.failed_sends, 'detail.failedAttempts')}
                    {health.last_failure
                      ? t('detail.lastOn', { date: health.last_failure.slice(0, 10) })
                      : t('detail.noFailureYet')}
                  </>
                ) : (
                  t('detail.noFailures')
                )}
              </div>
            </div>
          )
        })()}

        {customer.notes && (
          <p className="detail-notes" dir="auto">
            {customer.notes}
          </p>
        )}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && !loading && (
        <div className="card notice">
          <p>{t('detail.historyFailed')}</p>
          <p className="muted">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="detail-section">
            <div className="section-label">
              <span>{t('detail.vehicles')}</span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setAddingVehicle(true)}
              >
                {t('detail.addVehicle')}
              </button>
            </div>
            {vehicles.length === 0 ? (
              <p className="empty">{t('detail.noVehicles')}</p>
            ) : (
              vehicles.map((vehicle) => (
                <div className="card vehicle-card" key={vehicle.id}>
                  <div>
                    <div className="vehicle-plate num">
                      {vehicle.plate || t('detail.noPlate')}
                    </div>
                    <div className="vehicle-spec">
                      {[vehicle.make, vehicle.model, vehicle.year]
                        .filter(Boolean)
                        .join(' · ') || t('detail.noVehicleDetails')}
                    </div>
                  </div>
                  <div className="vehicle-side">
                    {vehicle.current_odometer !== null && (
                      <div className="vehicle-odo num">
                        {km(vehicle.current_odometer)} km
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn--quiet btn--small"
                      onClick={() => setEditingVehicle(vehicle)}
                    >
                      {t('action.edit')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="detail-section">
            <div className="section-label">
              <span>{t('detail.jobHistory')}</span>
            </div>
            {jobs.length === 0 ? (
              <p className="empty">{t('detail.noJobs')}</p>
            ) : (
              jobs.map((job) => (
                <div className="list-row" key={job.id}>
                  <div>
                    <div>
                      {t('detail.jobPrefix')}{' '}
                      <span className="num">#{job.job_no}</span> ·{' '}
                      {job.job_type.replace(/_/g, ' ')}
                    </div>
                    <div className="list-row-meta">
                      <span className="num">{job.start_date}</span> · {job.status}
                      {job.payment_method ? ` · ${job.payment_method}` : ''}
                    </div>
                  </div>
                  <div className="list-row-amount num">
                    {money(totals.get(job.id) ?? null)}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="detail-section">
            <div className="section-label">
              <span>{t('detail.pendingReminders')}</span>
            </div>
            {pendingReminders.length === 0 ? (
              <p className="empty">{t('detail.noneScheduled')}</p>
            ) : (
              pendingReminders.map(({ reminder, vehicle }) => (
                <div className="list-row" key={reminder.id}>
                  <div>
                    <div>
                      {localised(
                        reminder.services?.name_en,
                        reminder.services?.name_ar,
                      ) ?? t('detail.unknownService')}
                    </div>
                    <div className="list-row-meta num">
                      {vehicleLabel(vehicle)}
                    </div>
                  </div>
                  <div className="list-row-due">
                    {reminder.due_date && (
                      <div className="num">{reminder.due_date}</div>
                    )}
                    {reminder.due_odometer !== null && (
                      <div className="num">
                        {km(reminder.due_odometer)} {t('common.km')}
                      </div>
                    )}
                    {!reminder.due_date && reminder.due_odometer === null && (
                      <div>{t('detail.noDuePoint')}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="detail-section">
            <div className="section-label">
              <span>{t('detail.mutes')}</span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setMuting(true)}
              >
                {t('detail.muteAction')}
              </button>
            </div>

            <p className="field-note">{t('detail.muteNote')}</p>

            {mutes.length === 0 ? (
              <p className="empty">{t('detail.nothingMuted')}</p>
            ) : (
              mutes.map((mute) => (
                <div className="list-row mute-row" key={mute.id}>
                  <div>
                    <div>
                      {mute.service_id === null ? (
                        <span className="pill pill--amber">{t('detail.allReminders')}</span>
                      ) : (
                        localised(mute.service_en, mute.service_ar) ??
                        t('detail.unknownService')
                      )}
                    </div>
                    <div className="list-row-meta figures" dir="auto">
                      {t('detail.mutedOn', { date: mute.muted_at?.slice(0, 10) ?? '' })}
                      {mute.reason ? ` · ${mute.reason}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    disabled={!mute.id || unmutingId === mute.id}
                    onClick={() => mute.id && unmute(mute.id)}
                  >
                    {unmutingId === mute.id ? t('detail.unmuting') : t('detail.unmute')}
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}

      {editing && (
        <EditCustomerDialog
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onCustomerChanged(updated)
            setEditing(false)
          }}
        />
      )}

      {addingVehicle && (
        <VehicleDialog
          customerId={customer.id}
          onClose={() => setAddingVehicle(false)}
          onSaved={() => {
            setAddingVehicle(false)
            onVehicleAdded()
            setReloadToken((token) => token + 1)
          }}
        />
      )}

      {editingVehicle && (
        <VehicleDialog
          customerId={customer.id}
          vehicle={editingVehicle}
          onClose={() => setEditingVehicle(null)}
          onSaved={() => {
            setEditingVehicle(null)
            setReloadToken((token) => token + 1)
          }}
        />
      )}

      {muting && (
        <MuteDialog
          customerId={customer.id}
          staffId={staff.id}
          services={mutableServices}
          allMuted={mutes.some((mute) => mute.service_id === null)}
          onClose={() => setMuting(false)}
          onSaved={() => {
            setMuting(false)
            // The trigger cancels pending reminders, so reload rather than
            // patching state locally.
            setReloadToken((token) => token + 1)
          }}
        />
      )}
    </Dialog>
  )
}
