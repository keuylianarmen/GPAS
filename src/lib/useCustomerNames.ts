import { useRef, useState } from 'react'
import { suggestCustomerName } from './translateService'
import { isArabicScript } from './script'
import { makeTrace } from './suggest'

type Field = 'en' | 'ar'

/** What a field is currently advertising about its own contents. */
export type FieldMark = 'suggested' | 'moved' | null

export type CustomerNames = {
  en: string
  ar: string
  setEn: (next: string) => void
  setAr: (next: string) => void
  /** 'suggested' — the app wrote it. 'moved' — the user wrote it, elsewhere. */
  markOf: (field: Field) => FieldMark
  /** The field a reply is on its way to, while it is on its way. */
  pending: Field | null
  onBlurEn: () => void
  onBlurAr: () => void
  /** Call once the names are committed — a saved name carries no mark. */
  accept: () => void
}

const trace = makeTrace('customer names')

/**
 * The two name fields, with the empty one offered a transliteration of the
 * other when a field loses focus.
 *
 * A suggestion is never written silently. Unlike a service name, a person's
 * name is theirs, and the mapping is one-to-many — محمد is Mohammad, Mohammed,
 * Muhammad, Mohamad — so what lands in the field is marked until someone
 * touches it or saves it, and it is editable like anything else.
 *
 * Which name is which is decided by script, not by which box was typed into.
 * The English field autofocuses, so an Arabic name landing there is the normal
 * case, not the exception — it gets moved to the field it belongs in rather
 * than ignored.
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
  const [suggested, setSuggested] = useState<Field | null>(null)
  const [moved, setMoved] = useState<Field | null>(null)
  const [pending, setPending] = useState<Field | null>(null)

  // Only the newest request may write. Every manual edit and every move bumps
  // it too, so a reply that was already in flight when the fields changed
  // under it is dropped rather than landing on top of them.
  const request = useRef(0)

  // What produced the suggestion currently on screen. Without this, every
  // tab-through of an unchanged name field would fire another request and
  // rewrite the other field with the same answer.
  const lastAsk = useRef<{ typed: string; target: Field } | null>(null)

  function clearMarks(field: Field) {
    setSuggested((current) => (current === field ? null : current))
    setMoved((current) => (current === field ? null : current))
  }

  function setEn(next: string) {
    request.current += 1
    setEnState(next)
    clearMarks('en')
    // Any edit invalidates whatever is in flight, so nothing is waiting on a
    // reply any more — whichever field was showing that.
    setPending(null)
  }

  function setAr(next: string) {
    request.current += 1
    setArState(next)
    clearMarks('ar')
    setPending(null)
  }

  function write(field: Field, value: string) {
    if (field === 'en') setEnState(value)
    else setArState(value)
  }

  /**
   * Whether a field may be written over. Empty, obviously. A standing
   * suggestion, because that is the app's own previous answer and leaving it
   * in place is exactly how two names drift out of correspondence. Nothing
   * else — text that was typed, or typed elsewhere and moved here, is the
   * user's, and `is-suggested` clearing on the first keystroke is what tells
   * the two apart.
   */
  function replaceable(field: Field) {
    const value = (field === 'en' ? en : ar).trim()
    return value === '' || suggested === field
  }

  function ask(source: Field) {
    if (!suggest) {
      trace('nothing asked: suggestions are off for this customer', {
        source,
        suggest,
      })
      return
    }

    const typed = (source === 'en' ? en : ar).trim()
    if (!typed) {
      trace('nothing asked: the blurred field is empty', { source, en, ar, suggest })
      return
    }

    // The script decides which field this text belongs in. Any Arabic
    // character at all makes the whole string Arabic — a half-and-half name
    // is not something this can split.
    const belongsIn: Field = isArabicScript(typed) ? 'ar' : 'en'
    const misplaced = belongsIn !== source

    // Whichever field the text does not belong in is the one to fill. When the
    // text is misplaced that is the field it is sitting in right now, which
    // the move below empties.
    const target: Field = belongsIn === 'en' ? 'ar' : 'en'

    // Asking again with the same text for the same field would return the
    // same answer. Blur fires on every pass through a form.
    if (
      lastAsk.current?.typed === typed &&
      lastAsk.current.target === target &&
      suggested === target
    ) {
      trace('nothing asked: the standing suggestion already came from this text', {
        source,
        typed,
        target,
        suggest,
      })
      return
    }

    if (misplaced) {
      if (!replaceable(belongsIn)) {
        trace('nothing moved: the field this text belongs in holds a name of its own', {
          source,
          typed,
          belongsIn,
          occupant: (belongsIn === 'en' ? en : ar).trim(),
          mark: moved === belongsIn ? 'moved' : 'typed',
          suggest,
        })
        return
      }

      trace('moving the text to the field its script belongs in', {
        from: source,
        to: belongsIn,
        typed,
        suggest,
      })
      write(belongsIn, typed)
      write(source, '')
      setMoved(belongsIn)
      setSuggested(null)
    } else if (!replaceable(target)) {
      trace('nothing asked: the other field holds a name the user put there', {
        source,
        typed,
        target,
        occupant: (target === 'en' ? en : ar).trim(),
        mark: moved === target ? 'moved' : 'typed',
        suggest,
      })
      return
    }

    const token = ++request.current
    setPending(target)
    trace('asking for the other spelling', { typed, belongsIn, target, token })

    suggestCustomerName(typed).then((suggestion) => {
      const superseded = token !== request.current
      // A newer request owns the pending field by now; clearing it here would
      // switch off an indicator that belongs to a call still running.
      if (!superseded) setPending(null)

      if (!suggestion) {
        trace('no suggestion came back', { typed, token })
        return
      }
      if (superseded) {
        trace('suggestion dropped: the fields changed while it was in flight', {
          typed,
          token,
          current: request.current,
        })
        return
      }

      write(target, suggestion)
      setSuggested(target)
      lastAsk.current = { typed, target }
      trace('suggestion applied', { target, suggestion })
    })
  }

  return {
    en,
    ar,
    setEn,
    setAr,
    markOf: (field) =>
      suggested === field ? 'suggested' : moved === field ? 'moved' : null,
    pending,
    onBlurEn: () => ask('en'),
    onBlurAr: () => ask('ar'),
    accept: () => {
      setSuggested(null)
      setMoved(null)
      setPending(null)
    },
  }
}
