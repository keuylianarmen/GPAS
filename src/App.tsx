import { useEffect, useState } from 'react'
import NavDrawer from './components/NavDrawer'
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
import {
  LOCALES,
  applyLocaleToDocument,
  getLocale,
  setLocale,
  t,
  useLocale,
} from './lib/i18n'
import type { StringKey } from './lib/i18n'
import { localised } from './lib/i18n'
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

/**
 * Written before React renders anything, so the first paint is already in the
 * right direction rather than flipping after hydration.
 */
applyLocaleToDocument(getLocale())

function LanguageToggle() {
  const locale = useLocale()

  return (
    <div className="chips lang-toggle" role="group" aria-label={t('nav.language')}>
      {LOCALES.map((entry) => (
        <button
          type="button"
          key={entry.key}
          className="chip chip--onDark"
          lang={entry.key}
          aria-pressed={locale === entry.key}
          onClick={() => setLocale(entry.key)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
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
  // Subscribes the whole tree to the language, so every t() below re-resolves.
  useLocale()
  const [tab, setTab] = useState<Tab>(() => readStoredTab() ?? 'dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
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
          {/* Below the breakpoint this is the whole nav; above it, it is
              display:none and the tab row takes over. */}
          <button
            type="button"
            className="menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
          >
            <span aria-hidden="true">☰</span>
          </button>

          {/* A button, not a link: navigation here is state, there is no router
              and no URL to point at. It also means a click cannot scroll, which
              an <a href="#"> would. */}
          <button
            type="button"
            className="brand brand-home"
            onClick={() => setTab('dashboard')}
            aria-label={t('nav.brandHome')}
          >
            {/* Decorative: the button carries the name, so alt text here would
                only say it twice. */}
            <img className="brand-logo" src="/logo-dark.svg" alt="" />
            <span className="wordmark">{t('brand.name')}</span>
          </button>

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

          {/* The one action worth a tap of its own. Hidden above the
              breakpoint, where the tab row already carries it. */}
          <button
            type="button"
            className="btn btn--onDark btn--small new-job-shortcut"
            aria-current={tab === 'new-job' ? 'page' : undefined}
            onClick={() => setTab('new-job')}
          >
            {t('nav.newJob')}
          </button>

          <div className="topbar-identity">
            <LanguageToggle />
            <span className="topbar-name" dir="auto">
              {localised(staff.name_en, staff.name_ar)}
            </span>
            <SignOutButton className="btn btn--onDark btn--small" />
          </div>
        </div>
      </div>

      <NavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        footer={
          <>
            <span className="drawer-name" dir="auto">
              {localised(staff.name_en, staff.name_ar)}
            </span>
            <SignOutButton className="btn btn--ghost btn--small" />
          </>
        }
      >
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className="drawer-link"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => {
              setTab(key)
              setMenuOpen(false)
            }}
          >
            {t(labelKey)}
          </button>
        ))}
      </NavDrawer>

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
  useLocale()
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
