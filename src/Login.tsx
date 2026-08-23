import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail && !password) {
      setError('Enter your email and password.')
      return
    }
    if (!trimmedEmail) {
      setError('Enter your email.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }

    setError(null)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    // On success the auth listener swaps this screen out, so only the failure
    // path needs to release the form.
    if (authError) {
      setError(authError.message)
      setSubmitting(false)
    }
  }

  return (
    <main className="centered">
      <form className="card panel" onSubmit={handleSubmit} noValidate>
        <div className="panel-head">
          <h1>Sign in</h1>
          <p className="muted">Shop staff only.</p>
        </div>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoFocus
            disabled={submitting}
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={submitting}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
