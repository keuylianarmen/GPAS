import { useMemo, useState } from 'react'
import type { Database } from '../types/database'
import { money } from '../lib/format'
import { useServiceUsage } from '../lib/useServiceUsage'
import Dialog from './Dialog'
import { localised, t } from '../lib/i18n'

type Category = Database['public']['Tables']['service_categories']['Row']
type Service = Database['public']['Tables']['services']['Row']

/** Enough to be a shortcut, not enough to become a second list. */
const COMMON_LIMIT = 8

function serviceName(service: Service): string {
  return localised(service.name_en, service.name_ar) ?? ''
}

/** Searches both languages regardless of which one is displayed. */
function matches(service: Service, needle: string): boolean {
  if (!needle) return true
  return (
    service.name_en.toLowerCase().includes(needle) ||
    (service.name_ar ?? '').toLowerCase().includes(needle)
  )
}

export default function ServicePicker({
  services,
  categories,
  onPick,
  onClose,
}: {
  services: Service[]
  categories: Category[]
  onPick: (serviceId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const usage = useServiceUsage()

  const needle = query.trim().toLowerCase()
  const filtering = needle !== '' || categoryId !== null

  const categoryName = useMemo(
    () =>
      new Map(
        categories.map((category) => [
          category.id,
          localised(category.name_en, category.name_ar) ?? '',
        ]),
      ),
    [categories],
  )

  /**
   * Most used first: uses_90d, then all-time uses, then name. Services with no
   * usage at all never appear — a shortcut to something never done is noise.
   */
  const common = useMemo(() => {
    if (filtering) return []

    return services
      .flatMap((service) => {
        const stats = usage.get(service.id)
        if (!stats || stats.uses <= 0) return []
        return [{ service, ...stats }]
      })
      .sort(
        (a, b) =>
          b.uses90d - a.uses90d ||
          b.uses - a.uses ||
          serviceName(a.service).localeCompare(serviceName(b.service)),
      )
      .slice(0, COMMON_LIMIT)
  }, [services, usage, filtering])

  // Categories keep their sort_order; a service in the band still appears here.
  const grouped = useMemo(
    () =>
      categories
        .filter((category) => categoryId === null || category.id === categoryId)
        .map((category) => ({
          category,
          rows: services.filter(
            (service) =>
              service.category_id === category.id && matches(service, needle),
          ),
        }))
        .filter((group) => group.rows.length > 0),
    [categories, services, categoryId, needle],
  )

  const total = grouped.reduce((sum, group) => sum + group.rows.length, 0)

  return (
    <Dialog wide title={t('servicePicker.title')} onClose={onClose}>
      <div className="chips" role="group" aria-label={t('servicePicker.filterByCategory')}>
        <button
          type="button"
          className="chip"
          aria-pressed={categoryId === null}
          onClick={() => setCategoryId(null)}
        >
          {t('servicePicker.all')}
        </button>
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            className="chip"
            aria-pressed={categoryId === category.id}
            onClick={() =>
              setCategoryId((current) =>
                current === category.id ? null : category.id,
              )
            }
          >
            {localised(category.name_en, category.name_ar)}
          </button>
        ))}
      </div>

      <input
        className="input picker-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('servicePicker.search')}
        aria-label={t('servicePicker.search')}
        autoFocus
      />

      {/* A shortcut for the unfiltered view, so it steps aside once filtering. */}
      {common.length > 0 && (
        <section className="picker-section">
          <div className="section-label">
            <span>{t('servicePicker.common')}</span>
          </div>
          <div className="picker">
            {common.map(({ service }) => (
              <button
                type="button"
                key={service.id}
                className="picker-row"
                onClick={() => onPick(service.id)}
              >
                <span>
                  {serviceName(service)}{' '}
                  <span className="muted picker-cat">
                    {categoryName.get(service.category_id) ?? ''}
                  </span>
                </span>
                <span className="muted num">
                  {money(service.default_labor_price)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {total === 0 ? (
        <p className="empty">{t('servicePicker.noMatch')}</p>
      ) : (
        grouped.map(({ category, rows }) => (
          <section className="picker-section" key={category.id}>
            <div className="section-label">
              <span>{localised(category.name_en, category.name_ar)}</span>
              <span className="muted">
                <span className="num">{rows.length}</span>
              </span>
            </div>
            <div className="picker">
              {rows.map((service) => (
                <button
                  type="button"
                  key={service.id}
                  className="picker-row"
                  onClick={() => onPick(service.id)}
                >
                  <span>{serviceName(service)}</span>
                  <span className="muted num">
                    {money(service.default_labor_price)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </Dialog>
  )
}
