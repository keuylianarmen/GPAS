import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { parseOptionalNumber, parseOptionalPositiveInteger } from '../lib/parse'
import { useLookupListKeys } from '../lib/useLookupListKeys'
import Dialog from './Dialog'
import { t } from '../lib/i18n'

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
      setError(t('serviceForm.needCategory'))
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('serviceForm.needName'))
      return
    }

    const parsedPrice = parseOptionalNumber(price)
    if (parsedPrice === 'invalid' || (parsedPrice !== null && parsedPrice < 0)) {
      setError(t('serviceForm.badPrice'))
      return
    }

    let intervalKm: number | null = null
    let intervalMonths: number | null = null

    if (remind) {
      const parsedKm = parseOptionalPositiveInteger(reminderKm)
      const parsedMonths = parseOptionalPositiveInteger(reminderMonths)

      if (parsedKm === 'invalid' || parsedMonths === 'invalid') {
        setError(t('serviceForm.badInterval'))
        return
      }
      if (parsedKm === null && parsedMonths === null) {
        setError(t('serviceForm.needInterval'))
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
      setError(insertError?.message ?? t('serviceForm.saveFailed'))
      setSaving(false)
      return
    }

    onSaved(data)
  }

  return (
    <Dialog
      title={
        fixedCategory
          ? t('serviceForm.titleInCategory', { category: fixedCategory.name_en })
          : t('serviceForm.title')
      }
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} noValidate>
        {!fixedCategory && (
          <label className="field">
            <span>{t('serviceForm.category')}</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={saving}
            >
              <option value="">{t('serviceForm.chooseCategory')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_en}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>{t('serviceForm.name')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('serviceForm.namePlaceholder')}
            disabled={saving}
            autoFocus
          />
        </label>

        <label className="field">
          <span>
            {t('serviceForm.price')}{' '}
            <span className="field-hint">{t('common.optional')}</span>
          </span>
          <input
            className="num"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={t('serviceForm.pricePlaceholder')}
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
          {t('serviceForm.remind')}
        </label>

        {remind && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>
                  {t('serviceForm.intervalKm')}{' '}
                  <span className="field-hint">{t('common.km')}</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={reminderKm}
                  onChange={(event) => setReminderKm(event.target.value)}
                  placeholder={t('serviceForm.kmPlaceholder')}
                  disabled={saving}
                />
              </label>
              <label className="field">
                <span>
                  {t('serviceForm.intervalMonths')}{' '}
                  <span className="field-hint">{t('serviceForm.months')}</span>
                </span>
                <input
                  className="num"
                  inputMode="numeric"
                  value={reminderMonths}
                  onChange={(event) => setReminderMonths(event.target.value)}
                  placeholder={t('serviceForm.monthsPlaceholder')}
                  disabled={saving}
                />
              </label>
            </div>
            <p className="field-note">{t('serviceForm.reminderNote')}</p>
          </>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={usesFluid}
            onChange={(event) => setUsesFluid(event.target.checked)}
            disabled={saving}
          />
          {t('serviceForm.usesFluid')}
        </label>

        {usesFluid && (
          <>
            <div className="grid-2">
              <label className="field">
                <span>{t('serviceForm.fluidUnit')}</span>
                <select
                  value={fluidUnit}
                  onChange={(event) => setFluidUnit(event.target.value)}
                  disabled={saving}
                >
                  <option value="liters">{t('serviceForm.liters')}</option>
                  <option value="grams">{t('serviceForm.grams')}</option>
                </select>
              </label>
              <label className="field">
                <span>
                  {t('serviceForm.typeList')}{' '}
                  <span className="field-hint">{t('common.optional')}</span>
                </span>
                <select
                  value={fluidTypeList}
                  onChange={(event) => setFluidTypeList(event.target.value)}
                  disabled={saving}
                >
                  <option value="">{t('serviceForm.noTypeList')}</option>
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
                {t('serviceForm.gradeList')}{' '}
                <span className="field-hint">{t('common.optional')}</span>
              </span>
              <select
                value={fluidGradeList}
                onChange={(event) => setFluidGradeList(event.target.value)}
                disabled={saving}
              >
                <option value="">{t('serviceForm.noGradeList')}</option>
                {listKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-note">{t('serviceForm.fluidNote')}</p>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--dark btn--full" disabled={saving}>
          {saving ? t('action.saving') : t('serviceForm.save')}
        </button>
      </form>
    </Dialog>
  )
}
