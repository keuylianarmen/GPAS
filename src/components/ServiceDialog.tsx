import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Database } from '../types/database'
import { supabase } from '../lib/supabase'
import { parseOptionalNumber, parseOptionalPositiveInteger } from '../lib/parse'
import { useLookupListKeys } from '../lib/useLookupListKeys'
import Dialog from './Dialog'
import { localised, t, tn, useLocale } from '../lib/i18n'
import { translateServiceName } from '../lib/translateService'
import { isArabicScript } from '../lib/script'

type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']

/** One count per foreign key that points at services. */
type References = {
  jobItems: number
  reminders: number
  mutes: number
  parts: number
}

/**
 * The first reason deleting is blocked, in the order the constraints would bite.
 * Naming one specific reason beats a generic refusal — "muted for 2 customers"
 * tells you where to look.
 */
function firstBlocker(references: References): string | null {
  if (references.jobItems > 0)
    return tn(references.jobItems, 'serviceForm.refJobLines')
  if (references.reminders > 0)
    return tn(references.reminders, 'serviceForm.refReminders')
  if (references.mutes > 0) return tn(references.mutes, 'serviceForm.refMutes')
  if (references.parts > 0) return tn(references.parts, 'serviceForm.refParts')
  return null
}

/**
 * Creating and editing a service.
 *
 * Creating takes one name and translates it on submit. Editing shows both
 * names, current locale first, and never re-translates: a hand-corrected name
 * is the intended value, and regenerating it would undo the correction.
 *
 * `fixedCategory` pins a new service to one category (the Services screen,
 * where the action already names it). Editing always shows the picker, since a
 * service filed in the wrong category needs moving.
 */
export default function ServiceDialog({
  categories,
  fixedCategory,
  service,
  onClose,
  onSaved,
  onRemoved,
}: {
  categories: Category[]
  fixedCategory?: Category
  /** Present for edit mode. */
  service?: Service
  onClose: () => void
  onSaved: (service: Service) => void
  /** Deactivated or deleted — either way it leaves the catalogue. */
  onRemoved?: () => void
}) {
  const editing = service !== undefined
  const locale = useLocale()
  const arabicFirst = locale === 'ar'

  const [categoryId, setCategoryId] = useState(
    service ? String(service.category_id) : fixedCategory ? String(fixedCategory.id) : '',
  )
  const [name, setName] = useState('')
  const [nameEnField, setNameEnField] = useState(service?.name_en ?? '')
  const [nameArField, setNameArField] = useState(service?.name_ar ?? '')
  // Only revealed when an Arabic name could not be translated: name_en is NOT
  // NULL, so there is no way to store the service without one.
  const [englishName, setEnglishName] = useState('')
  const [needsEnglish, setNeedsEnglish] = useState(false)
  const [price, setPrice] = useState(
    service?.default_labor_price == null ? '' : String(service.default_labor_price),
  )
  const [remind, setRemind] = useState(service?.triggers_reminder ?? false)
  const [reminderKm, setReminderKm] = useState(
    service?.reminder_km == null ? '' : String(service.reminder_km),
  )
  const [reminderMonths, setReminderMonths] = useState(
    service?.reminder_months == null ? '' : String(service.reminder_months),
  )
  const [usesFluid, setUsesFluid] = useState(Boolean(service?.fluid_unit))
  const [fluidUnit, setFluidUnit] = useState(service?.fluid_unit ?? 'liters')
  const [fluidTypeList, setFluidTypeList] = useState(service?.fluid_type_list ?? '')
  const [fluidGradeList, setFluidGradeList] = useState(service?.fluid_grade_list ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Deleting is only offered when nothing at all points at the service.
  // null = still counting, 'failed' = could not tell, so treat it as in use.
  const [references, setReferences] = useState<References | 'failed' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const listKeys = useLookupListKeys()

  useEffect(() => {
    if (!service) return
    const serviceId = service.id

    let cancelled = false

    async function count() {
      // Every foreign key that points at services, so Delete is only offered
      // when the row is genuinely unreferenced.
      const [jobItems, reminders, mutes, parts] = await Promise.all([
        supabase
          .from('job_items')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', serviceId),
        supabase
          .from('reminders')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', serviceId),
        supabase
          .from('reminder_mutes')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', serviceId),
        supabase
          .from('service_parts')
          .select('service_id', { count: 'exact', head: true })
          .eq('service_id', serviceId),
      ])

      if (cancelled) return

      const failure =
        jobItems.error ?? reminders.error ?? mutes.error ?? parts.error
      if (failure) {
        console.error('Could not count references to this service', failure)
        setReferences('failed')
        return
      }

      setReferences({
        jobItems: jobItems.count ?? 0,
        reminders: reminders.count ?? 0,
        mutes: mutes.count ?? 0,
        parts: parts.count ?? 0,
      })
    }

    count()

    return () => {
      cancelled = true
    }
  }, [service])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const chosenCategoryId = fixedCategory ? fixedCategory.id : Number(categoryId)
    if (!chosenCategoryId) {
      setError(t('serviceForm.needCategory'))
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

    // Shared by both paths.
    const shape = {
      category_id: chosenCategoryId,
      default_labor_price: parsedPrice,
      triggers_reminder: remind,
      reminder_km: intervalKm,
      reminder_months: intervalMonths,
      // Null unit is what marks a service as not using a fluid.
      fluid_unit: usesFluid ? fluidUnit : null,
      fluid_type_list: usesFluid && fluidTypeList ? fluidTypeList : null,
      fluid_grade_list: usesFluid && fluidGradeList ? fluidGradeList : null,
    }

    if (service) {
      // Both names are saved exactly as typed. No translation call: a corrected
      // name is the intended value, and regenerating would undo the fix.
      const editedEn = nameEnField.trim()
      const editedAr = nameArField.trim()

      if (!editedEn) {
        setError(t('serviceForm.needEnglish'))
        return
      }

      setError(null)
      setSaving(true)

      const { data, error: updateError } = await supabase
        .from('services')
        .update({ ...shape, name_en: editedEn, name_ar: editedAr || null })
        .eq('id', service.id)
        .select()
        .single()

      if (updateError || !data) {
        setError(updateError?.message ?? t('serviceForm.saveFailed'))
        setSaving(false)
        return
      }

      onSaved(data)
      return
    }

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('serviceForm.needName'))
      return
    }

    const arabicInput = isArabicScript(trimmedName)
    const typedEnglish = englishName.trim()

    if (needsEnglish && !typedEnglish) {
      setError(t('serviceForm.needEnglish'))
      return
    }

    setError(null)
    setSaving(true)

    // One extra round trip before the insert: the typed name goes to its own
    // column and the translation to the other.
    let nameEn = arabicInput ? '' : trimmedName
    let nameAr = arabicInput ? trimmedName : null

    if (needsEnglish) {
      // Already been round the loop once; the user supplied the English name.
      nameEn = typedEnglish
    } else {
      const translated = await translateServiceName(trimmedName, chosenCategoryId)

      if ('error' in translated) {
        if (arabicInput) {
          // Nothing to put in name_en, so the save cannot proceed.
          setSaving(false)
          setNeedsEnglish(true)
          setError(t('serviceForm.translateFailed', { reason: translated.error }))
          return
        }
        // English input: store it alone. localised() falls back to name_en, and
        // the Arabic name can be added by editing later.
        nameAr = null
      } else if (arabicInput) {
        nameEn = translated.translation
      } else {
        nameAr = translated.translation
      }
    }

    // pricing_model is left out so the column default applies.
    const { data, error: insertError } = await supabase
      .from('services')
      .insert({ ...shape, name_en: nameEn, name_ar: nameAr })
      .select()
      .single()

    if (insertError || !data) {
      setError(insertError?.message ?? t('serviceForm.saveFailed'))
      setSaving(false)
      return
    }

    onSaved(data)
  }

  const blocker =
    references !== null && references !== 'failed'
      ? firstBlocker(references)
      : null
  // Unknown counts are treated as in use.
  const canDelete =
    references !== null && references !== 'failed' && blocker === null

  /** Leaves job lines pointing at it; only hides it from the picker. */
  async function deactivate() {
    if (!service) return
    setError(null)
    setSaving(true)

    const { error: updateError } = await supabase
      .from('services')
      .update({ active: false })
      .eq('id', service.id)

    if (updateError) {
      setError(updateError.message || t('serviceForm.deactivateFailed'))
      setSaving(false)
      return
    }
    onRemoved?.()
  }

  async function remove() {
    if (!service) return
    setError(null)
    setSaving(true)

    const { error: deleteError } = await supabase
      .from('services')
      .delete()
      .eq('id', service.id)

    if (deleteError) {
      // Reminders, mutes and parts also point at services, so a row with no job
      // lines can still be referenced.
      setError(deleteError.message || t('serviceForm.deleteFailed'))
      setSaving(false)
      return
    }
    onRemoved?.()
  }

  return (
    <Dialog
      title={
        editing
          ? t('serviceForm.editTitle')
          : fixedCategory
            ? t('serviceForm.titleInCategory', {
                category: localised(fixedCategory.name_en, fixedCategory.name_ar) ?? '',
              })
            : t('serviceForm.title')
      }
      onClose={onClose}
      busy={saving}
    >
      <form onSubmit={handleSubmit} noValidate>
        {(editing || !fixedCategory) && (
          <label className="field">
            <span>{t('serviceForm.category')}</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={saving}
            >
              {!editing && (
                <option value="">{t('serviceForm.chooseCategory')}</option>
              )}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {localised(category.name_en, category.name_ar)}
                </option>
              ))}
            </select>
          </label>
        )}

        {editing ? (
          <>
            {/* The locale's own name leads; the other language sits beneath it,
                de-emphasised but editable, so an unreviewed translation can be
                corrected without switching the app language. */}
            <label className="field">
              <span>{t('serviceForm.name')}</span>
              <input
                dir={arabicFirst ? 'rtl' : 'ltr'}
                value={arabicFirst ? nameArField : nameEnField}
                onChange={(event) =>
                  arabicFirst
                    ? setNameArField(event.target.value)
                    : setNameEnField(event.target.value)
                }
                placeholder={t('serviceForm.namePlaceholder')}
                disabled={saving}
                autoFocus
              />
            </label>

            <label className="field field--secondary">
              <span>
                {arabicFirst
                  ? t('serviceForm.otherNameEn')
                  : t('serviceForm.otherNameAr')}{' '}
                <span className="field-hint">{t('serviceForm.otherNameHint')}</span>
              </span>
              <input
                dir={arabicFirst ? 'ltr' : 'rtl'}
                value={arabicFirst ? nameEnField : nameArField}
                onChange={(event) =>
                  arabicFirst
                    ? setNameEnField(event.target.value)
                    : setNameArField(event.target.value)
                }
                disabled={saving}
              />
            </label>
            <p className="field-note">{t('serviceForm.otherNameNote')}</p>
          </>
        ) : (
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
        )}

        {needsEnglish && (
          <label className="field">
            <span>
              {t('serviceForm.englishName')}{' '}
              <span className="field-hint">{t('serviceForm.englishNameHint')}</span>
            </span>
            <input
              dir="ltr"
              value={englishName}
              onChange={(event) => setEnglishName(event.target.value)}
              placeholder={t('serviceForm.namePlaceholder')}
              disabled={saving}
              autoFocus
            />
          </label>
        )}

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

        {editing && (
          <div className="service-danger">
            {references === null ? (
              <p className="field-note">{t('serviceForm.checkingUse')}</p>
            ) : (
              <>
                <p className="field-note">
                  {references === 'failed'
                    ? t('serviceForm.checkFailed')
                    : blocker
                      ? t('serviceForm.blocked', { reason: blocker })
                      : t('serviceForm.deactivateNote')}
                </p>

                {confirmingDelete ? (
                  <div className="confirm-row">
                    <span className="muted">{t('serviceForm.deleteConfirm')}</span>
                    <button
                      type="button"
                      className="btn btn--danger btn--small"
                      onClick={remove}
                      disabled={saving}
                    >
                      {t('serviceForm.deletePermanently')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--quiet btn--small"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={saving}
                    >
                      {t('jobEdit.keep')}
                    </button>
                  </div>
                ) : (
                  <div className="confirm-row">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={deactivate}
                      disabled={saving}
                    >
                      {saving
                        ? t('serviceForm.deactivating')
                        : t('serviceForm.deactivate')}
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className="btn btn--quiet btn--small"
                        onClick={() => setConfirmingDelete(true)}
                        disabled={saving}
                      >
                        {t('serviceForm.delete')}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
