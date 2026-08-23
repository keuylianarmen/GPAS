import type { LookupValue } from '../lib/useLookup'

/**
 * Optional lookup-backed select. Stores `value`, shows `label_en`, and clears
 * back to null via the blank option. A stored value that is no longer in the
 * active list is kept as an extra option so saving cannot silently drop it.
 */
export default function LookupSelect({
  value,
  options,
  onChange,
  disabled = false,
  blankLabel = 'Not recorded',
}: {
  value: string
  options: LookupValue[]
  onChange: (next: string) => void
  disabled?: boolean
  blankLabel?: string
}) {
  const known = options.some((option) => option.value === value)

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">{blankLabel}</option>
      {value !== '' && !known && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.value}>
          {option.label_en}
        </option>
      ))}
    </select>
  )
}
