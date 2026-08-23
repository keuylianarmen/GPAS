import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import Dialog from './components/Dialog'
import AddCustomerDialog from './components/AddCustomerDialog'
import EditCustomerDialog from './components/EditCustomerDialog'
import VehicleDialog from './components/VehicleDialog'
import MuteDialog from './components/MuteDialog'
import { customerLabel, matchesCustomerSearch } from './lib/customer'

type Customer = Database['public']['Tables']['customers']['Row']
type Vehicle = Database['public']['Tables']['vehicles']['Row']
type Job = Database['public']['Tables']['jobs']['Row']
type Service = Database['public']['Tables']['services']['Row']
type Mute = Database['public']['Views']['v_customer_mutes']['Row']
type Staff = Database['public']['Tables']['staff']['Row']

type CustomerListItem = Customer & { vehicleCount: number; jobCount: number }

export default function Customers({ staff }: { staff: Staff }) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [query, setQuery] = useState('')
  const [openCustomer, setOpenCustomer] = useState<CustomerListItem | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Counted in Postgres rather than by pulling every vehicle and job row.
      const { data, error: loadError } = await supabase
        .from('customers')
        .select('*, vehicles(count), jobs(count)')
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (loadError) {
        setError(loadError.message)
        setLoading(false)
        return
      }

      setCustomers(
        (data ?? []).map(({ vehicles, jobs, ...customer }) => ({
          ...customer,
          vehicleCount: vehicles[0]?.count ?? 0,
          jobCount: jobs[0]?.count ?? 0,
        })),
      )
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const visible = useMemo(
    () => customers.filter((customer) => matchesCustomerSearch(customer, query)),
    [customers, query],
  )

  if (loading) {
    return <p className="muted">Loading customers…</p>
  }

  if (error) {
    return (
      <div className="card notice">
        <p>Could not load customers.</p>
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
          Try again
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
            placeholder="Search by name or phone"
            aria-label="Search customers"
          />
        </div>
        <button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>
          Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <p className="empty">No customers yet.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No customer matches “{query.trim()}”.</p>
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
                  <span className="pill pill--green">Opted in</span>
                ) : (
                  <span className="pill pill--amber">No opt-in</span>
                )}
              </div>

              <div className="customer-phone num">{customer.phone || 'No phone'}</div>

              <div className="customer-counts">
                <span className="num">{customer.vehicleCount}</span>{' '}
                {customer.vehicleCount === 1 ? 'vehicle' : 'vehicles'} ·{' '}
                <span className="num">{customer.jobCount}</span>{' '}
                {customer.jobCount === 1 ? 'job' : 'jobs'}
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
          }}
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
  onClose,
  onCustomerChanged,
  onVehicleAdded,
}: {
  customer: CustomerListItem
  staff: Staff
  onClose: () => void
  onCustomerChanged: (customer: Customer) => void
  onVehicleAdded: () => void
}) {
  const [vehicles, setVehicles] = useState<VehicleWithReminders[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [totals, setTotals] = useState<Map<string, number | null>>(new Map())
  const [mutes, setMutes] = useState<Mute[]>([])
  const [services, setServices] = useState<Service[]>([])
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
      const [vehicleResult, jobResult, muteResult, serviceResult] = await Promise.all([
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
          .order('start_date', { ascending: false }),
        supabase
          .from('v_customer_mutes')
          .select('*')
          .eq('customer_id', customer.id)
          .order('muted_at', { ascending: false }),
        supabase.from('services').select('*').eq('active', true).order('name_en'),
      ])

      if (cancelled) return

      const failure =
        vehicleResult.error ??
        jobResult.error ??
        muteResult.error ??
        serviceResult.error
      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      const loadedJobs = jobResult.data ?? []
      setVehicles(vehicleResult.data ?? [])
      setJobs(loadedJobs)
      setMutes(muteResult.data ?? [])
      setServices(serviceResult.data ?? [])

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

  return (
    <Dialog wide title={customerLabel(customer)} onClose={onClose}>
      <div className="detail-lede">
        <div className="detail-head">
          <div>
            <div className="detail-phone num">
              {customer.phone || 'No phone on file'}
            </div>
            <div className="detail-since">
              Customer since {customer.created_at.slice(0, 10)}
              {customer.source ? ` · ${customer.source}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>

        <div className="badge-row">
          {customer.whatsapp_opt_in ? (
            <span className="pill pill--green">Opted in to WhatsApp</span>
          ) : (
            <span className="pill pill--amber">No WhatsApp opt-in</span>
          )}
          {customer.is_periodic && <span className="pill">Regular schedule</span>}
        </div>

        {customer.notes && (
          <p className="detail-notes" dir="auto">
            {customer.notes}
          </p>
        )}
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && !loading && (
        <div className="card notice">
          <p>Could not load this customer’s history.</p>
          <p className="muted">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="detail-section">
            <div className="section-label">
              <span>Vehicles</span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setAddingVehicle(true)}
              >
                Add vehicle
              </button>
            </div>
            {vehicles.length === 0 ? (
              <p className="empty">No vehicle on file.</p>
            ) : (
              vehicles.map((vehicle) => (
                <div className="card vehicle-card" key={vehicle.id}>
                  <div>
                    <div className="vehicle-plate num">
                      {vehicle.plate || 'No plate'}
                    </div>
                    <div className="vehicle-spec">
                      {[vehicle.make, vehicle.model, vehicle.year]
                        .filter(Boolean)
                        .join(' · ') || 'No details recorded'}
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
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="detail-section">
            <div className="section-label">
              <span>Job history</span>
            </div>
            {jobs.length === 0 ? (
              <p className="empty">No jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <div className="list-row" key={job.id}>
                  <div>
                    <div>
                      Job <span className="num">#{job.job_no}</span> ·{' '}
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
              <span>Pending reminders</span>
            </div>
            {pendingReminders.length === 0 ? (
              <p className="empty">None scheduled.</p>
            ) : (
              pendingReminders.map(({ reminder, vehicle }) => (
                <div className="list-row" key={reminder.id}>
                  <div>
                    <div>
                      {reminder.services?.name_en ?? 'Unknown service'}
                    </div>
                    <div className="list-row-meta num">
                      {vehicle.plate || 'No plate'}
                    </div>
                  </div>
                  <div className="list-row-due">
                    {reminder.due_date && (
                      <div className="num">{reminder.due_date}</div>
                    )}
                    {reminder.due_odometer !== null && (
                      <div className="num">{km(reminder.due_odometer)} km</div>
                    )}
                    {!reminder.due_date && reminder.due_odometer === null && (
                      <div>No due point set</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="detail-section">
            <div className="section-label">
              <span>Reminder mutes</span>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setMuting(true)}
              >
                Mute a reminder
              </button>
            </div>

            <p className="field-note">
              A mute silences one kind of message. It is separate from the
              WhatsApp opt-in above, which is consent to be contacted at all.
            </p>

            {mutes.length === 0 ? (
              <p className="empty">Nothing muted.</p>
            ) : (
              mutes.map((mute) => (
                <div className="list-row mute-row" key={mute.id}>
                  <div>
                    <div>
                      {mute.service_id === null ? (
                        <span className="pill pill--amber">All reminders</span>
                      ) : (
                        mute.service_en ?? 'Unknown service'
                      )}
                    </div>
                    <div className="list-row-meta">
                      Muted <span className="num">{mute.muted_at?.slice(0, 10)}</span>
                      {mute.reason ? ` · ${mute.reason}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    disabled={!mute.id || unmutingId === mute.id}
                    onClick={() => mute.id && unmute(mute.id)}
                  >
                    {unmutingId === mute.id ? 'Unmuting…' : 'Unmute'}
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
          services={services}
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
