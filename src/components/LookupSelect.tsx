import type { LookupValue } from '../lib/useLookup'

/**
 * Optional lookup-backed select. Shows `label_en` and clears back to null via
 * the blank option. Stores `value` by default; `store="label_en"` is for
 * columns holding the display name itself, like vehicles.make. A stored entry
 * that is no longer in the active list is kept as an extra option so saving
 * cannot silently drop it.
 */
export default function LookupSelect({
  value,
  options,
  onChange,
  disabled = false,
  blankLabel = 'Not recorded',
  store = 'value',
}: {
  value: string
  options: LookupValue[]
  onChange: (next: string) => void
  disabled?: boolean
  blankLabel?: string
  store?: 'value' | 'label_en'
}) {
  const stored = (option: LookupValue) =>
    store === 'label_en' ? option.label_en : option.value
  const known = options.some((option) => stored(option) === value)

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">{blankLabel}</option>
      {value !== '' && !known && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option.id} value={stored(option)}>
          {option.label_en}
        </option>
      ))}
    </select>
  )
}
