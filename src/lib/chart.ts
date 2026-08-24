/**
 * Two-series categorical pair, validated against both chart surfaces:
 * deutan ΔE 19.2, normal-vision ΔE 25.3, both inside the lightness band and
 * above the chroma floor. Crimson is the existing brand accent; the blue is
 * the nearest restrained partner that clears colour-vision separation — red
 * and green fail it outright (ΔE 5.9), and amber fails even for normal vision.
 *
 * Revenue is always crimson and counts are always blue, across every chart.
 */
export const SERIES = {
  revenue: '#a32d2d',
  count: '#2b6ca8',
} as const

export const CHART_INK = {
  grid: '#e2e0da',
  axis: '#6e7071',
  surface: '#ffffff',
} as const

export const AXIS_TICK = { fill: CHART_INK.axis, fontSize: 11 } as const

export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e2e0da',
  borderRadius: 8,
  fontSize: 12,
  color: '#1a1c1d',
  boxShadow: 'none',
} as const

/** Axis ticks only — tooltips and tiles keep full three-decimal money. */
export function compactNumber(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

/** Recharts hands tooltip formatters a loose union; narrow it once here. */
export type TooltipValue = number | string | readonly (number | string)[] | undefined
export type TooltipName = number | string | undefined

export function tooltipNumber(value: TooltipValue): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}
