import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { money, reminderRule } from './lib/format'
import ServiceDialog from './components/ServiceDialog'
import { localised, t, tn } from './lib/i18n'

type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']

export default function Services() {
  const [categories, setCategories] = useState<Category[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [openCategoryId, setOpenCategoryId] = useState<number | null>(null)
  const [addingTo, setAddingTo] = useState<Category | null>(null)
  const [editingService, setEditingService] = useState<Service | null>(null)
  // Quiet filter for services that Arabic users cannot see.
  const [onlyMissingArabic, setOnlyMissingArabic] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [categoryResult, serviceResult] = await Promise.all([
        supabase
          .from('service_categories')
          .select('*')
          .eq('active', true)
          .order('sort_order')
          .order('name_en'),
        supabase.from('services').select('*').eq('active', true),
      ])

      if (cancelled) return

      const failure = categoryResult.error ?? serviceResult.error
      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      const loadedCategories = categoryResult.data ?? []
      setCategories(loadedCategories)
      setServices(serviceResult.data ?? [])
      setOpenCategoryId((current) => current ?? loadedCategories[0]?.id ?? null)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  // Grouped and sorted here rather than by the query, so a newly inserted
  // service lands in its proper place without refetching.
  const missingArabic = services.filter((service) => !service.name_ar).length

  const byCategory = useMemo(() => {
    const groups = new Map<number, Service[]>()
    for (const service of services) {
      if (onlyMissingArabic && service.name_ar) continue
      const group = groups.get(service.category_id)
      if (group) group.push(service)
      else groups.set(service.category_id, [service])
    }
    for (const group of groups.values()) {
      group.sort((a, b) =>
        (localised(a.name_en, a.name_ar) ?? '').localeCompare(
          localised(b.name_en, b.name_ar) ?? '',
        ),
      )
    }
    return groups
  }, [services, onlyMissingArabic])

  function retry() {
    setError(null)
    setLoading(true)
    setReloadToken((token) => token + 1)
  }

  if (loading) {
    return <p className="muted">{t('services.loading')}</p>
  }

  if (error) {
    return (
      <div className="card notice">
        <p>{t('services.loadFailed')}</p>
        <p className="muted">{error}</p>
        <button type="button" className="btn btn--ghost btn--small" onClick={retry}>
          {t('action.tryAgain')}
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="section-label">
        <span>{t('services.catalogue')}</span>
        <span className="muted section-label-right">
          {tn(services.length, 'services.count')}
          {missingArabic > 0 && (
            <>
              {' · '}
              <button
                type="button"
                className="quiet-link"
                aria-pressed={onlyMissingArabic}
                onClick={() => setOnlyMissingArabic((only) => !only)}
              >
                {onlyMissingArabic
                  ? t('services.showAll')
                  : tn(missingArabic, 'services.missingArabic')}
              </button>
            </>
          )}
        </span>
      </div>

      {onlyMissingArabic && (
        <p className="field-note">{t('services.onlyMissingArabic')}</p>
      )}

      {categories.length === 0 && (
        <p className="empty">{t('services.noCategories')}</p>
      )}

      {categories.map((category) => {
        const rows = byCategory.get(category.id) ?? []
        const open = openCategoryId === category.id

        return (
          <section className="card cat" key={category.id}>
            <button
              type="button"
              className="cat-toggle"
              aria-expanded={open}
              onClick={() => setOpenCategoryId(open ? null : category.id)}
            >
              <span className="cat-name">
                {localised(category.name_en, category.name_ar)}
              </span>
              <span className="muted">
                <span className="num">{rows.length}</span>
                <span className="cat-chevron">{open ? '−' : '+'}</span>
              </span>
            </button>

            {open && (
              <div className="cat-body">
                {rows.length === 0 ? (
                  <p className="cat-row muted">{t('services.emptyCategory')}</p>
                ) : (
                  rows.map((service) => {
                    const rule = reminderRule(
                      service.reminder_km,
                      service.reminder_months,
                    )
                    return (
                      <div className="cat-row service" key={service.id}>
                        <div>
                          <div className="service-name">
                            {localised(service.name_en, service.name_ar)}
                          </div>
                          {service.triggers_reminder && (
                            <div className="service-meta muted">
                              {rule
                                ? t('services.reminderRule', { rule })
                                : t('services.reminderNoInterval')}
                            </div>
                          )}
                        </div>
                        <div className="service-side">
                          <span className="num service-price">
                            {money(service.default_labor_price)}
                          </span>
                          <button
                            type="button"
                            className="btn btn--quiet btn--small"
                            onClick={() => setEditingService(service)}
                          >
                            {t('action.edit')}
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}

                <div className="cat-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => setAddingTo(category)}
                  >
                    {t('services.addTo', {
                      category: localised(category.name_en, category.name_ar) ?? '',
                    })}
                  </button>
                </div>
              </div>
            )}
          </section>
        )
      })}

      {editingService && (
        <ServiceDialog
          categories={categories}
          service={editingService}
          onClose={() => setEditingService(null)}
          onSaved={(updated) => {
            setServices((current) =>
              current.map((row) => (row.id === updated.id ? updated : row)),
            )
            setEditingService(null)
          }}
          onRemoved={() => {
            // Deactivated or deleted; either way it leaves the active catalogue.
            setServices((current) =>
              current.filter((row) => row.id !== editingService.id),
            )
            setEditingService(null)
          }}
        />
      )}

      {addingTo && (
        <ServiceDialog
          categories={categories}
          fixedCategory={addingTo}
          onClose={() => setAddingTo(null)}
          onSaved={(service) => {
            setServices((current) => [...current, service])
            setOpenCategoryId(service.category_id)
            setAddingTo(null)
          }}
        />
      )}
    </>
  )
}
