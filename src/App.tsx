import { useState } from 'react'
import Login from './Login'
import { supabase } from './lib/supabase'
import { useStaff } from './lib/useStaff'
import './App.css'

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
          <SignOutButton className="btn" />
        </div>
      </main>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">GPAS</span>
        <div className="identity">
          <span className="name" dir="auto">
            {staff.name_en || staff.name_ar}
          </span>
          <span className="role">{staff.role}</span>
          <SignOutButton className="btn-quiet" />
        </div>
      </header>
      <main className="workspace">
        <p className="muted">Nothing here yet.</p>
      </main>
    </div>
  )
}
