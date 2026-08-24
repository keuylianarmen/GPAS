import { useEffect, useState } from 'react'
import Login from './Login'
import Customers from './Customers'
import NewJob from './NewJob'
import Jobs from './Jobs'
import Reminders from './Reminders'
import Dashboard from './Dashboard'
import Stats from './Stats'
import Services from './Services'
import { supabase } from './lib/supabase'
import { useStaff } from './lib/useStaff'
import { t } from './lib/i18n'
import type { StringKey } from './lib/i18n'
import type { Staff } from './lib/useStaff'
import './App.css'

type Tab =
  | 'dashboard'
  | 'new-job'
  | 'jobs'
  | 'customers'
  | 'reminders'
  | 'services'
  | 'stats'

const TABS: { key: Tab; labelKey: StringKey }[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard' },
  { key: 'new-job', labelKey: 'nav.newJob' },
  { key: 'jobs', labelKey: 'nav.jobs' },
  { key: 'customers', labelKey: 'nav.customers' },
  { key: 'reminders', labelKey: 'nav.reminders' },
  { key: 'services', labelKey: 'nav.services' },
  { key: 'stats', labelKey: 'nav.stats' },
]

/**
 * sessionStorage is the right lifetime here: it survives a reload but dies with
 * the tab, so a refresh returns you where you were while a genuinely new
 * session starts at the Dashboard. localStorage would outlive the session;
 * plain state would not survive the reload at all.
 */
const TAB_STORAGE_KEY = 'gpas.tab'

function isTab(value: string | null): value is Tab {
  return value !== null && TABS.some((tab) => tab.key === value)
}

function readStoredTab(): Tab | null {
  try {
    const stored = sessionStorage.getItem(TAB_STORAGE_KEY)
    return isTab(stored) ? stored : null
  } catch {
    // Storage can be unavailable; falling back to the default is fine.
    return null
  }
}

function clearStoredTab() {
  try {
    sessionStorage.removeItem(TAB_STORAGE_KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

function SignOutButton({ className }: { className: string }) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    // So the next sign-in starts at the Dashboard rather than wherever the
    // previous person left off.
    clearStoredTab()
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
      {signingOut ? t('app.signingOut') : t('app.signOut')}
    </button>
  )
}

function Shell({ staff }: { staff: Staff }) {
  const [tab, setTab] = useState<Tab>(() => readStoredTab() ?? 'dashboard')
  // Set when a screen links straight to one customer; cleared once opened.
  const [focusCustomerId, setFocusCustomerId] = useState<string | null>(null)

  // Written here rather than at each call site, so every route that changes
  // the tab is covered.
  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {
      // Storage unavailable; the tab simply will not survive a reload.
    }
  }, [tab])

  return (
    <div className="shell">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img className="brand-logo" src="/logo-dark.svg" alt={t('brand.alt')} />
            <span className="wordmark">{t('brand.name')}</span>
          </div>

          {/* Sections of the app, not tabs within a panel — so these are links
              in spirit, and skip the arrow-key semantics of a real tablist. */}
          <nav className="tabs" aria-label={t('nav.sections')}>
            {TABS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                className="tab"
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => setTab(key)}
              >
                {t(labelKey)}
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
          <Customers
            staff={staff}
            focusCustomerId={focusCustomerId}
            onFocusHandled={() => setFocusCustomerId(null)}
          />
        ) : tab === 'jobs' ? (
          <Jobs staff={staff} />
        ) : tab === 'reminders' ? (
          <Reminders />
        ) : tab === 'stats' ? (
          <Stats
            onOpenCustomer={(customerId) => {
              setFocusCustomerId(customerId)
              setTab('customers')
            }}
          />
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
        <p className="muted">{t('app.loading')}</p>
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
            <h1>{t('app.noStaffTitle')}</h1>
            <p className="muted">
              {t('app.noStaffBody', { email: session.user.email ?? '' })}
            </p>
          </div>
          <SignOutButton className="btn btn--dark btn--full" />
        </div>
      </main>
    )
  }

  return <Shell staff={staff} />
}
