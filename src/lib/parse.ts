/** Blank means "not set"; anything unparseable is reported rather than coerced to 0. */
export function parseOptionalNumber(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : 'invalid'
}

/** Whole number, zero allowed — odometers and years. */
export function parseOptionalInteger(raw: string): number | null | 'invalid' {
  const parsed = parseOptionalNumber(raw)
  if (parsed === 'invalid') return 'invalid'
  if (parsed === null) return null
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 'invalid'
}

/** Whole number above zero — reminder intervals, where 0 would be meaningless. */
export function parseOptionalPositiveInteger(
  raw: string,
): number | null | 'invalid' {
  const parsed = parseOptionalInteger(raw)
  if (parsed === 'invalid' || parsed === null) return parsed
  return parsed > 0 ? parsed : 'invalid'
}
