import { strings } from './strings'

export type StringKey = keyof typeof strings

/**
 * Looks up a UI string. `{name}` placeholders are filled from `params`.
 *
 * English only for now — there is no locale switch and no second catalogue.
 * The point of routing every string through here is that adding one becomes a
 * matter of supplying another catalogue, not hunting through JSX.
 */
export function t(
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  const template: string = strings[key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  )
}

/**
 * Picks between a singular and plural key. English has two forms; Arabic has
 * six CLDR categories, so a real second language needs this replaced with
 * Intl.PluralRules rather than extended.
 */
export function tn(count: number, one: StringKey, other: StringKey): string {
  return t(count === 1 ? one : other, { count })
}
