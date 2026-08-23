import { useState } from 'react'
import Login from './Login'
import Customers from './Customers'
import NewJob from './NewJob'
import Jobs from './Jobs'
import Reminders from './Reminders'
import Dashboard from './Dashboard'
import Services from './Services'
import { supabase } from './lib/supabase'
import { useStaff } from './lib/useStaff'
import type { Staff } from './lib/useStaff'
import './App.css'

type Tab =
  | 'dashboard'
  | 'new-job'
  | 'jobs'
  | 'customers'
  | 'reminders'
  | 'services'

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'new-job', label: 'New job' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'customers', label: 'Customers' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'services', label: 'Services' },
]

function SignOutButton({ className }: { className: string }) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out failed', error)
      setSigningOut(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleSignOut}
      disabled={signingOut}
    >
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  )
}

function Shell({ staff }: { staff: Staff }) {
  const [tab, setTab] = useState<Tab>('services')

  return (
    <div className="shell">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true" />
            <span className="wordmark">GRAND PRIX</span>
          </div>

          {/* Sections of the app, not tabs within a panel — so these are links
              in spirit, and skip the arrow-key semantics of a real tablist. */}
          <nav className="tabs" aria-label="Sections">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className="tab"
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="topbar-identity">
            <span className="topbar-name" dir="auto">
              {staff.name_en || staff.name_ar}
            </span>
            <SignOutButton className="btn btn--onDark btn--small" />
          </div>
        </div>
      </div>

      <main className="workspace">
        {tab === 'services' ? (
          <Services />
        ) : tab === 'customers' ? (
          <Customers staff={staff} />
        ) : tab === 'jobs' ? (
          <Jobs staff={staff} />
        ) : tab === 'reminders' ? (
          <Reminders />
        ) : tab === 'new-job' ? (
          <NewJob />
        ) : (
          <Dashboard onNavigate={setTab} />
        )}
      </main>
    </div>
  )
}

export default function App() {
  const { session, staff, loading } = useStaff()

  if (loading) {
    return (
      <main className="centered">
        <p className="muted">Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <Login />
  }

  // Signed in to Supabase, but nobody has linked this account to a staff row.
  if (!staff) {
    return (
      <main className="centered">
        <div className="card panel">
          <div className="panel-head">
            <h1>No staff record</h1>
            <p className="muted">
              {session.user.email} is not linked to a staff record yet. Ask an
              admin to add you.
            </p>
          </div>
          <SignOutButton className="btn btn--dark btn--full" />
        </div>
      </main>
    )
  }

  return <Shell staff={staff} />
}
