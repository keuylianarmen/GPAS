import { useState } from 'react'
import { useSubcontractors } from '../lib/useSubcontractors'
import AddSubcontractorDialog from './AddSubcontractorDialog'
import { localised, t } from '../lib/i18n'

/**
 * Optional. A line can carry a sub price with nobody attached, or somebody
 * attached with no price — the two are independent columns and nothing here
 * validates one against the other.
 *
 * A row that is no longer active is kept as an extra option when it is the
 * stored value, so editing an old line cannot silently drop who did the work.
 */
export default function SubcontractorPicker({
  value,
  name,
  onChange,
  disabled = false,
}: {
  value: string | null
  /** The stored row's name, so one since deactivated still reads as itself. */
  name?: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const rows = useSubcontractors()
  const [adding, setAdding] = useState(false)

  const known = value === null || rows.some((row) => row.id === value)

  return (
    <>
      <span className="price--who-row">
        <select
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          disabled={disabled}
        >
          <option value="">{t('common.notSet')}</option>
          {value !== null && !known && (
            <option value={value}>{name ?? t('sub.unknown')}</option>
          )}
          {/* Pattern 1: a bilingual pair, so the label switches language and
              the value — subcontractor_id — does not. Ordering stays on the
              Latin name; PostgREST cannot sort by a locale-dependent
              expression, and the identifier at least sorts the same in both. */}
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {localised(row.name, row.name_ar) ?? row.name}
            </option>
          ))}
        </select>

        {/* "+" alone: the row has no width for a worded button, and the label
            carries the name for anything not reading the glyph. */}
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => setAdding(true)}
          disabled={disabled}
          aria-label={t('sub.add')}
        >
          +
        </button>
      </span>

      {adding && (
        <AddSubcontractorDialog
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            onChange(id)
            setAdding(false)
          }}
        />
      )}
    </>
  )
}
