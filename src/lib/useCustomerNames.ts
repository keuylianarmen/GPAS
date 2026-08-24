import { useRef, useState } from 'react'
import { suggestCustomerName } from './translateService'
import { isArabicScript } from './script'

/** Which field is currently holding a machine suggestion nobody has touched. */
export type SuggestedField = 'en' | 'ar' | null

export type CustomerNames = {
  en: string
  ar: string
  setEn: (next: string) => void
  setAr: (next: string) => void
  suggested: SuggestedField
  onBlurEn: () => void
  onBlurAr: () => void
  /** Call once the names are committed — a saved suggestion is just a name. */
  accept: () => void
}

/**
 * The two name fields, with the empty one offered a transliteration of the
 * other when a field loses focus.
 *
 * A suggestion is never written silently. Unlike a service name, a person's
 * name is theirs, and the mapping is one-to-many — محمد is Mohammad, Mohammed,
 * Muhammad, Mohamad — so what lands in the field is marked until someone
 * touches it or saves it, and it is editable like anything else.
 */
export function useCustomerNames({
  initialEn = '',
  initialAr = '',
  suggest,
}: {
  initialEn?: string
  initialAr?: string
  /**
   * False when the customer already had both names. Whatever is there was
   * typed by a person, and re-deriving one half after a hand correction
   * would throw that correction away.
   */
  suggest: boolean
}): CustomerNames {
  const [en, setEnState] = useState(initialEn)
  const [ar, setArState] = useState(initialAr)
  const [suggested, setSuggested] = useState<SuggestedField>(null)

  // Only the newest request may write. Every manual edit bumps it too, so a
  // reply that was already in flight when someone started typing is dropped
  // rather than landing on top of them.
  const request = useRef(0)

  function setEn(next: string) {
    request.current += 1
    setEnState(next)
    setSuggested((current) => (current === 'en' ? null : current))
  }

  function setAr(next: string) {
    request.current += 1
    setArState(next)
    setSuggested((current) => (current === 'ar' ? null : current))
  }

  function ask(source: 'en' | 'ar') {
    if (!suggest) return

    const name = (source === 'en' ? en : ar).trim()
    if (!name) return

    // Only ever fills an empty field — a suggestion does not get to replace
    // something a person put there.
    const target = source === 'en' ? 'ar' : 'en'
    if ((target === 'en' ? en : ar).trim() !== '') return

    // The function reads direction off the input script, so an Arabic name
    // typed into the English box would come back as Latin and land in the
    // Arabic field. Leave the mismatch alone; it is the more useful signal.
    if (isArabicScript(name) !== (source === 'ar')) return

    const token = ++request.current

    suggestCustomerName(name).then((suggestion) => {
      if (!suggestion || token !== request.current) return

      if (target === 'ar') setArState(suggestion)
      else setEnState(suggestion)
      setSuggested(target)
    })
  }

  return {
    en,
    ar,
    setEn,
    setAr,
    suggested,
    onBlurEn: () => ask('en'),
    onBlurAr: () => ask('ar'),
    accept: () => setSuggested(null),
  }
}
