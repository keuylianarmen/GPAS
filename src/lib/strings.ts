import { en } from './strings.en'
import { ar } from './strings.ar'

export type Locale = 'en' | 'ar'

export type StringKey = keyof typeof en

/**
 * A locale catalogue holds every key the English one does. Extra keys are
 * allowed so a locale can supply plural categories English does not have —
 * 'base.few' and the rest.
 */
export type Catalogue = Record<StringKey, string> & Record<string, string>

export const LOCALES: { key: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  // Each label is written in its own language, so it reads correctly whichever
  // locale is active.
  { key: 'en', label: 'English', dir: 'ltr' },
  { key: 'ar', label: 'العربية', dir: 'rtl' },
]

export const catalogues: Record<Locale, Catalogue> = { en, ar }
