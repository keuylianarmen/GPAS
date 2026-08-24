import { useId, useMemo, useRef, useState } from 'react'
import { useVehicleModels } from '../lib/useVehicleModels'
import { useModelCatalog } from '../lib/useModelCatalog'
import { matchModels, mergeModelSources } from '../lib/modelMatch'
import { t } from '../lib/i18n'

/** Long enough to be worth scrolling past, short enough to stay a shortcut. */
const VISIBLE = 8

/**
 * The model field: free text with suggestions, never a constrained list.
 *
 * Two sources behind it — models this shop has put on a car, and the make's
 * lineup from the shared catalogue — merged so a model in both appears once,
 * spelled the way the shop spells it. Typing filters both spellings, with
 * enough tolerance that a near miss still surfaces.
 *
 * What gets stored is always the canonical Latin name. `vehicles.model` is one
 * Latin column and there is no Arabic counterpart to write.
 */
export default function ModelField({
  make,
  value,
  onChange,
  disabled = false,
}: {
  make: string
  value: string
  onChange: (model: string) => void
  disabled?: boolean
}) {
  const own = useVehicleModels(make)
  const { models: catalogue, loading } = useModelCatalog(make)
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // A click on a suggestion blurs the input first; without this the list is
  // gone before the click lands.
  const picking = useRef(false)

  const options = useMemo(
    () => mergeModelSources(own, catalogue),
    [own, catalogue],
  )

  const matches = useMemo(
    () => (make ? matchModels(options, value).slice(0, VISIBLE) : []),
    [options, value, make],
  )

  const showing = open && matches.length > 0
  // Only while there is genuinely nothing to show. With the shop's own models
  // already in the list, saying "finding models" would be noise about a list
  // that is already useful.
  const waiting = loading && matches.length === 0

  function pick(model: string) {
    onChange(model)
    setOpen(false)
    setActive(0)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!showing) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => (current + 1) % matches.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => (current - 1 + matches.length) % matches.length)
    } else if (event.key === 'Enter') {
      // Only claims Enter while a suggestion is highlighted — otherwise the
      // form submits, which is what Enter does everywhere else here.
      event.preventDefault()
      pick(matches[active].name_en)
    }
  }

  return (
    <div className="typeahead">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!picking.current) setOpen(false)
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {waiting && <p className="typeahead-note">{t('vehicleForm.loadingModels')}</p>}

      {showing && (
        <ul className="typeahead-list" id={listId} role="listbox" aria-label={t('vehicleForm.modelSuggestions')}>
          {matches.map((option, index) => (
            <li key={option.name_en} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={
                  index === active ? 'typeahead-row typeahead-row--active' : 'typeahead-row'
                }
                // mousedown fires before blur; this is what keeps the list
                // alive long enough for the click to be delivered.
                onMouseDown={() => {
                  picking.current = true
                }}
                onMouseUp={() => {
                  picking.current = false
                }}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option.name_en)}
              >
                <span>{option.name_en}</span>
                {option.name_ar && <span className="typeahead-alt">{option.name_ar}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
