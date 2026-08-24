import { useEffect, useMemo, useState } from 'react'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { money, reminderRule } from './lib/format'
import AddServiceDialog from './components/AddServiceDialog'
import { t, tn } from './lib/i18n'

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
  const byCategory = useMemo(() => {
    const groups = new Map<number, Service[]>()
    for (const service of services) {
      const group = groups.get(service.category_id)
      if (group) group.push(service)
      else groups.set(service.category_id, [service])
    }
    for (const group of groups.values()) {
      group.sort((a, b) => a.name_en.localeCompare(b.name_en))
    }
    return groups
  }, [services])

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
        <span className="muted">
          {tn(services.length, 'services.countOne', 'services.countOther')}
        </span>
      </div>

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
              <span className="cat-name">{category.name_en}</span>
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
                          <div className="service-name">{service.name_en}</div>
                          {service.triggers_reminder && (
                            <div className="service-meta muted">
                              {rule
                                ? t('services.reminderRule', { rule })
                                : t('services.reminderNoInterval')}
                            </div>
                          )}
                        </div>
                        <span className="num service-price">
                          {money(service.default_labor_price)}
                        </span>
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
                    {t('services.addTo', { category: category.name_en })}
                  </button>
                </div>
              </div>
            )}
          </section>
        )
      })}

      {addingTo && (
        <AddServiceDialog
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
