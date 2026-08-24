/**
 * Chart colour, read from the stylesheet rather than restated here.
 *
 * The charts sit on the page background with no panel of their own, so every
 * colour they use has to be the same one the rest of the app uses — a second
 * copy in TypeScript is a second thing to keep in step. Recharts wants plain
 * colour strings for its SVG props, so the values are read from the custom
 * properties once, on first use, rather than passed through as `var()`.
 *
 * Series pairing, validated rather than chosen by eye (OKLab ΔE ×100, against
 * the page surface #f2f1ed):
 *
 *   crimson + blue   deutan 19.2 · tritan 28.8 · normal 25.3   all checks pass
 *
 * Charcoal cannot be a second series: it fails the lightness band (0.225) and
 * reads as grey (chroma 0.004). Slate greys clear lightness but still read
 * grey and collapse to deutan ΔE 9.3 — a third of the blue's separation. So
 * charcoal stays what it already is here: the ink of the grid, the axes and
 * the tooltip, never the data.
 *
 * A third slot, if one is ever needed, is the app's amber: crimson → blue →
 * amber passes all six checks in that adjacency order. The green does not
 * (deutan 5.9 against crimson).
 */
type ChartTheme = {
  revenue: string
  count: string
  grid: string
  axis: string
  /** Primary text on the plot — a service name, not its axis label. */
  label: string
  /**
   * What sits behind the marks — the panel, not the page. The gap between two
   * stacked segments is drawn in it, so it has to be the colour that would
   * show through the gap, or it reads as a pale line ruled over the bar.
   */
  surface: string
  /** The band behind a hovered mark. */
  cursor: string
}

let theme: ChartTheme | null = null

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * Read once, on the first render of the Stats screen — by which point the
 * stylesheet is applied. Cached because a getComputedStyle per chart per
 * render is a layout read in a hot path.
 */
export function chartTheme(): ChartTheme {
  if (!theme) {
    theme = {
      revenue: readVar('--crimson'),
      count: readVar('--chart-count'),
      grid: readVar('--chart-grid'),
      axis: readVar('--muted'),
      label: readVar('--ink'),
      surface: readVar('--chart-panel'),
      cursor: readVar('--chart-cursor'),
    }
  }
  return theme
}

/** Axis ticks wear the app's muted text, at the app's own family and size. */
export function axisTick(ink: ChartTheme) {
  return { fill: ink.axis, fontSize: 11, fontFamily: 'var(--sans)' } as const
}

/**
 * A tooltip floats over the plot and has to be legible, so it stays a surface
 * — but the app's own floating surface, matching the typeahead dropdown, not
 * recharts' white box. This one is HTML rather than SVG, so `var()` resolves.
 */
export const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-sm)',
  boxShadow: 'var(--shadow-float)',
  fontFamily: 'var(--sans)',
  fontSize: 12,
  color: 'var(--ink)',
  padding: '8px 10px',
} as const

export const TOOLTIP_LABEL_STYLE = {
  color: 'var(--muted)',
  fontSize: 11,
  marginBottom: 4,
} as const

export const TOOLTIP_ITEM_STYLE = { color: 'var(--ink)', padding: 0 } as const

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
