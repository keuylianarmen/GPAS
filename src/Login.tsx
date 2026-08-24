import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { t } from './lib/i18n'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail && !password) {
      setError(t('login.needBoth'))
      return
    }
    if (!trimmedEmail) {
      setError(t('login.needEmail'))
      return
    }
    if (!password) {
      setError(t('login.needPassword'))
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
        <div className="brand brand--login">
          <img
            className="brand-logo brand-logo--lg"
            src="/logo.svg"
            alt={t('brand.alt')}
          />
          <span className="wordmark">{t('brand.name')}</span>
        </div>

        <div className="panel-head">
          <h1>{t('login.title')}</h1>
          <p className="muted">{t('login.subtitle')}</p>
        </div>

        <label className="field">
          <span>{t('login.email')}</span>
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
          <span>{t('login.password')}</span>
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

        <button
          type="submit"
          className="btn btn--dark btn--full"
          disabled={submitting}
        >
          {submitting ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
    </main>
  )
}
