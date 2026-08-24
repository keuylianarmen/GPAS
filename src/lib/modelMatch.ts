import { foldForSearch } from './arabic'

export type ModelOption = {
  /** The canonical Latin name. This is what gets stored. */
  name_en: string
  name_ar: string | null
  /** True when this shop has put this model on a car itself. */
  own: boolean
  /** Position in the shop's own most-used order; Infinity for catalogue rows. */
  rank: number
}

/**
 * How many single-character edits a name may be away from what was typed and
 * still be offered.
 *
 * Scaled by the length of what was typed, because one edit means something
 * very different at three characters than at ten. Under five characters there
 * is no fuzzy matching at all — at that length nearly every short model name
 * is within one edit of every other, and the list becomes noise. Six is where
 * two edits has to start: "korola" is two from "Corolla" (c/k, and a missing
 * l), and missing that is the whole complaint.
 */
export function toleranceFor(typed: string): number {
  if (typed.length < 5) return 0
  if (typed.length === 5) return 1
  return 2
}

/**
 * Levenshtein distance, bailing out once it cannot come in under `limit`.
 * Two short strings, forty rows, one keystroke — the early exit matters less
 * than it looks, but a length gap alone is enough to skip the matrix.
 */
export function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  if (a === b) return 0

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let best = i

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost, // substitution
      )
      current.push(value)
      if (value < best) best = value
    }

    // Every remaining row can only add to the best score on this one.
    if (best > limit) return limit + 1
    previous = current
  }

  return previous[b.length]
}

/**
 * Quality of the match, lowest first. This is the primary sort: an exact hit
 * on a catalogue model beats a fuzzy hit on one of the shop's own, because
 * what someone typed is better evidence than where a row came from.
 */
const EXACT = 0
const PREFIX = 1
const CONTAINS = 2
const FUZZY = 3
const NONE = 4

/** Multi-word names match on any word, so "cruiser" finds "Land Cruiser". */
function scoreOne(candidate: string, typed: string, tolerance: number): number {
  if (!candidate) return NONE
  if (candidate === typed) return EXACT

  const words = candidate.split(' ')
  if (candidate.startsWith(typed) || words.some((word) => word.startsWith(typed))) {
    return PREFIX
  }
  if (candidate.includes(typed)) return CONTAINS

  if (tolerance > 0) {
    for (const part of [candidate, ...words]) {
      if (editDistance(part, typed, tolerance) <= tolerance) return FUZZY
    }
  }
  return NONE
}

/** The better of the two spellings — someone may type either. */
function score(option: ModelOption, typed: string, tolerance: number): number {
  return Math.min(
    scoreOne(foldForSearch(option.name_en), typed, tolerance),
    option.name_ar ? scoreOne(foldForSearch(option.name_ar), typed, tolerance) : NONE,
  )
}

/**
 * The models to offer for what has been typed, best first.
 *
 * Ordering, in order of precedence:
 *   1. match quality — exact, then prefix, then substring, then fuzzy
 *   2. the shop's own models before catalogue ones
 *   3. within the shop's own, most used first
 *   4. alphabetical
 *
 * Quality outranks provenance deliberately: "still rank above" holds within a
 * tier, but a fuzzy guess should never displace something the user typed
 * exactly, whoever put it in the list.
 */
export function matchModels(options: ModelOption[], query: string): ModelOption[] {
  const typed = foldForSearch(query)
  if (!typed) {
    return [...options].sort(
      (a, b) =>
        Number(b.own) - Number(a.own) ||
        a.rank - b.rank ||
        a.name_en.localeCompare(b.name_en),
    )
  }

  const tolerance = toleranceFor(typed)

  return options
    .map((option) => ({ option, quality: score(option, typed, tolerance) }))
    .filter((row) => row.quality < NONE)
    .sort(
      (a, b) =>
        a.quality - b.quality ||
        Number(b.option.own) - Number(a.option.own) ||
        a.option.rank - b.option.rank ||
        a.option.name_en.localeCompare(b.option.name_en),
    )
    .map((row) => row.option)
}

/**
 * One list from two sources. The shop's own spelling wins — a catalogue row
 * for a model already on a car here is dropped rather than shown twice — but
 * its Arabic spelling is carried across, since the shop's own list is a bare
 * column of Latin strings and would otherwise lose Arabic matching entirely.
 */
export function mergeModelSources(
  own: string[],
  catalogue: { name_en: string; name_ar: string | null }[],
): ModelOption[] {
  const key = (name: string) => name.trim().toLowerCase()
  const arabicFor = new Map(catalogue.map((row) => [key(row.name_en), row.name_ar]))

  const merged: ModelOption[] = own.map((name, index) => ({
    name_en: name,
    name_ar: arabicFor.get(key(name)) ?? null,
    own: true,
    rank: index,
  }))

  const taken = new Set(own.map(key))
  for (const row of catalogue) {
    if (taken.has(key(row.name_en))) continue
    merged.push({ name_en: row.name_en, name_ar: row.name_ar, own: false, rank: Infinity })
  }

  return merged
}
