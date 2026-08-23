import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Dialog from './Dialog'

/** A service this customer currently has an unmuted pending reminder for. */
export type MutableService = { id: string; name: string }

/**
 * A mute is a preference about one kind of message, distinct from
 * whatsapp_opt_in, which is consent to be contacted at all. Inserting a mute
 * cancels anything already pending — a trigger does that, so callers refetch.
 */
export default function MuteDialog({
  customerId,
  staffId,
  services,
  allMuted,
  onClose,
  onSaved,
}: {
  customerId: string
  staffId: string
  /** Derived from pending reminders, minus anything already muted. */
  services: MutableService[]
  /** A service_id-null mute already exists; a unique index allows only one. */
  allMuted: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const canMuteService = services.length > 0
  const canMuteAll = !allMuted
  const canMute = canMuteService || canMuteAll

  const [scope, setScope] = useState<'service' | 'all'>(
    canMuteService ? 'service' : 'all',
  )
  const [serviceId, setServiceId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canMute) return

    if (scope === 'service' && !serviceId) {
      setError('Choose the service to mute.')
      return
    }

    if (scope === 'all' && !canMuteAll) {
      setError('Everything is already muted for this customer.')
      return
    }

    setError(null)
    setSaving(true)

    // service_id null is the mute-everything case.
    const { error: insertError } = await supabase.from('reminder_mutes').insert({
      customer_id: customerId,
      service_id: scope === 'all' ? null : serviceId,
      reason: reason.trim() || null,
      muted_by: staffId,
    })

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <Dialog title="Mute reminders" onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>What to mute</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as 'service' | 'all')}
            disabled={saving}
          >
            <option value="service" disabled={!canMuteService}>
              One service
            </option>
            <option value="all" disabled={!canMuteAll}>
              Every reminder for this customer
            </option>
          </select>
        </label>

        {!canMute ? (
          <p className="field-note">
            Everything is already muted for this customer. Unmute something first
            to change it.
          </p>
        ) : !canMuteService ? (
          <p className="field-note">
            This customer has nothing pending left to mute service by service.
            Muting everything still covers reminders raised later.
          </p>
        ) : (
          !canMuteAll && (
            <p className="field-note">
              A blanket mute is already in place for this customer, so only
              individual services can be added.
            </p>
          )
        )}

        {scope === 'service' && canMuteService && canMute && (
          <label className="field">
            <span>Service</span>
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              disabled={saving}
            >
              <option value="">Choose a service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>
            Reason <span className="field-hint">optional</span>
          </span>
          <input
            dir="auto"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Asked us not to"
            disabled={saving}
          />
        </label>

        <p className="field-note">
          Muting cancels any reminder of this kind that is already pending.
        </p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn--dark btn--full"
          disabled={saving || !canMute}
        >
          {saving ? 'Muting…' : 'Mute'}
        </button>
      </form>
    </Dialog>
  )
}
