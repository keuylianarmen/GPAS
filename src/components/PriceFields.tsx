import { money } from '../lib/format'
import { sumPrices } from '../lib/parse'
import { t } from '../lib/i18n'

/**
 * Parts, labour and sub sit on one compact row with the line total beside
 * them — three small numbers rather than three form rows. All optional; blank
 * counts as zero, which is what the columns default to.
 */
export default function PriceFields({
  partPrice,
  laborPrice,
  subPrice,
  onChange,
  disabled = false,
}: {
  partPrice: string
  laborPrice: string
  subPrice: string
  onChange: (field: 'partPrice' | 'laborPrice' | 'subPrice', next: string) => void
  disabled?: boolean
}) {
  const fields = [
    { key: 'partPrice', label: t('price.parts'), value: partPrice },
    { key: 'laborPrice', label: t('price.labour'), value: laborPrice },
    { key: 'subPrice', label: t('price.sub'), value: subPrice },
  ] as const

  return (
    <div className="prices">
      {fields.map((field) => (
        <label className="price" key={field.key}>
          <span>{field.label}</span>
          <input
            className="num"
            inputMode="decimal"
            value={field.value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder="0.000"
            disabled={disabled}
          />
        </label>
      ))}

      <div className="price price--total">
        <span>{t('price.lineTotal')}</span>
        <div className="num">{money(sumPrices(partPrice, laborPrice, subPrice))}</div>
      </div>
    </div>
  )
}
