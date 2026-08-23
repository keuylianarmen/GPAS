import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { parseOptionalNumber, parseOptionalPositiveInteger } from '../lib/parse'
import { useLookupListKeys } from '../lib/useLookupListKeys'
import Dialog from './Dialog'

type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']

/**
 * `fixedCategory` pins the dialog to one category (the Services screen, where
 * the action already names it). Without it a category picker is shown, which is
 * what the job screen needs when an unlisted service turns up mid-job.
 */
export default function AddServiceDialog({
  categories,
  fixedCategory,
  onClose,
  onSaved,
}: {
  categories: Category[]
  fixedCategory?: Category
  onClose: () => void
  onSaved: (service: Service) => void
}) {
  const [categoryId, setCategoryId] = useState(
    fixedCategory ? String(fixedCategory.id) : '',
  )
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [remind, setRemind] = useState(false)
  const [reminderKm, setReminderKm] = useState('')
  const [reminderMonths, setReminderMonths] = useState('')
  const [usesFluid, setUsesFluid] = useState(false)
  const [fluidUnit, setFluidUnit] = useState('liters')
  const [fluidTypeList, setFluidTypeList] = useState('')
  const [fluidGradeList, setFluidGradeList] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const listKeys = useLookupListKeys()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const chosenCategoryId = fixedCategory ? fixedCategory.id : Number(categoryId)
    if (!chosenCategoryId) {
      setError('Choose a category.')
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Enter a service name.')
      return
    }

    const parsedPrice = parseOptionalNumber(price)
    if (parsedPrice === 'invalid' || (parsedPrice !== null && parsedPrice < 0)) {
      setError('Default price must be a positive number, or left blank.')
      return
    }

    let intervalKm: number | null = null
    let intervalMonths: number | null = null

    if (remind) {
      const parsedKm = parseOptionalPositiveInteger(reminderKm)
      const parsedMonths = parseOptionalPositiveInteger(reminderMonths)

      if (parsedKm === 'invalid' || parsedMonths === 'invalid') {
        setError('Distance and time must be whole numbers above zero, or left blank.')
        return
      }
      if (parsedKm === null && parsedMonths === null) {
        setError('Give the reminder a distance, a time, or both.')
        return
      }

      intervalKm = parsedKm
      intervalMonths = parsedMonths
    }

    setError(null)
    setSaving(true)

    // pricing_model is left out so the column default applies.
    const { data, error: insertError } = await supabase
      .from('services')
      .insert({
        category_id: chosenCategoryId,
        name_en: trimmedName,
        default_labor_price: parsedPrice,
        triggers_reminder: remind,
        reminder_km: intervalKm,
        reminder_months: intervalMonths,
        // Null unit is what marks a service as not using a fluid.
        fluid_unit: usesFluid ? fluidUnit : null,
        fluid_type_list: usesFluid && fluidTypeList ? fluidTypeList : null,
        fluid_grade_list: usesFluid && fluidGradeList ? fluidGradeList : null,
      })
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? 'The service could not be saved.')
      setSaving(false)
      return
    }

    onSaved(data)
  }

  return (
    <Dialog
      title={fixedCategory ? `New service · ${fixedCategory.name_en}` : 'New service'}
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} noValidate>
        {!fixedCategory && (
          <label className="field">
            <span>Category</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={saving}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_en}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>Service name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Radiator flush"
            disabled={saving}
            autoFocus
          />
        </label>

        <label className="field">
          <span>
            Default price <span className="field-hint">optional</span>
          </span>
          <input
            className="num"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="0.000"
            disabled={saving}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={remind}
            onChange={(event) => setRemind(event.target.checked)}
            disabled={saving}
          />
          Schedule a reminder after this service
        </label>

        {remind && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>
                  Usual interval <span className="field-hint">km</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={reminderKm}
                  onChange={(event) => setReminderKm(event.target.value)}
                  placeholder="5000"
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>
                  Or <span className="field-hint">months</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={reminderMonths}
                  onChange={(event) => setReminderMonths(event.target.value)}
                  placeholder="6"
                  disabled={saving}
                />
              </label>
            </div>
            <p className="field-note">
              Used to prefill the due point when this service is added to a job.
              The job line is what actually creates the reminder.
            </p>
          </>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={usesFluid}
            onChange={(event) => setUsesFluid(event.target.checked)}
            disabled={saving}
          />
          This service uses a fluid
        </label>

        {usesFluid && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>Measured in</span>
                <select
                  value={fluidUnit}
                  onChange={(event) => setFluidUnit(event.target.value)}
                  disabled={saving}
                >
                  <option value="liters">Liters</option>
                  <option value="grams">Grams</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Type list <span className="field-hint">optional</span>
                </span>
                <select
                  value={fluidTypeList}
                  onChange={(event) => setFluidTypeList(event.target.value)}
                  disabled={saving}
                >
                  <option value="">No standard list</option>
                  {listKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>
                Grade list <span className="field-hint">optional</span>
              </span>
              <select
                value={fluidGradeList}
                onChange={(event) => setFluidGradeList(event.target.value)}
                disabled={saving}
              >
                <option value="">No grade list</option>
                {listKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-note">
              Job lines for this service will ask for brand and quantity, plus a
              type or grade wherever a list is chosen.
            </p>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving ? 'Saving…' : 'Save service'}
        </button>
      </form>
    </Dialog>
  )
}
