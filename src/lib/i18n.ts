import { useSyncExternalStore } from 'react'
import { LOCALES, catalogues } from './strings'
import type { Catalogue, Locale, StringKey } from './strings'

export type { Locale, StringKey } from './strings'
export { LOCALES } from './strings'

/**
 * localStorage rather than sessionStorage: which language someone reads is a
 * durable preference, not something to re-choose every time the tab reopens.
 */
const LOCALE_STORAGE_KEY = 'gpas.locale'

function isLocale(value: string | null): value is Locale {
  return value !== null && LOCALES.some((locale) => locale.key === value)
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(stored) ? stored : 'en'
  } catch {
    // Storage unavailable; English is the default either way.
    return 'en'
  }
}

let current: Locale = readStoredLocale()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find((entry) => entry.key === locale)?.dir ?? 'ltr'
}

/** Drives the document's own direction, which the whole layout keys off. */
export function applyLocaleToDocument(locale: Locale) {
  const root = document.documentElement
  root.lang = locale
  root.dir = localeDir(locale)
}

export function setLocale(next: Locale) {
  if (next === current) return
  current = next

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  } catch {
    // The choice still applies for this session.
  }

  applyLocaleToDocument(next)
  for (const notify of listeners) notify()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Re-renders the caller when the language changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, getLocale)
}

function catalogue(locale: Locale): Catalogue {
  return catalogues[locale]
}

function lookup(key: string): string {
  // An untranslated key falls back to English rather than rendering blank.
  const active = catalogue(current)[key]
  if (active) return active
  return catalogue('en')[key] ?? key
}

/** Looks up a UI string. `{name}` placeholders are filled from `params`. */
export function t(
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  const template = lookup(key)
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  )
}

/** Plural bases: every key ending in `.other` names one. Distributes over the
 *  StringKey union via a type parameter, which a bare conditional would not. */
type BaseOf<Key> = Key extends `${infer Base}.other` ? Base : never
export type PluralBase = BaseOf<StringKey>

const pluralRules = new Map<Locale, Intl.PluralRules>()

function rulesFor(locale: Locale): Intl.PluralRules {
  const existing = pluralRules.get(locale)
  if (existing) return existing
  const created = new Intl.PluralRules(locale)
  pluralRules.set(locale, created)
  return created
}

/**
 * Selects a plural form with Intl.PluralRules. English resolves to one/other;
 * Arabic can resolve to zero, one, two, few, many or other, and any category
 * the catalogue does not define falls back to `base.other`.
 */
export function tn(
  count: number,
  base: PluralBase,
  params?: Record<string, string | number>,
): string {
  const category = rulesFor(current).select(count)
  const values = { count, ...params }

  const specific = catalogue(current)[`${base}.${category}`]
  if (specific) return fill(specific, values)

  return t(`${base}.other` as StringKey, values)
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  )
}

/**
 * Picks the active language's copy of a database field, falling back to the
 * other when it is null. Never returns blank because one side is missing.
 */
export function localised(
  en: string | null | undefined,
  ar: string | null | undefined,
): string | null {
  const preferred = current === 'ar' ? ar : en
  const fallback = current === 'ar' ? en : ar
  return preferred || fallback || null
}
