/**
 * Shared machinery for fields the app offers to fill in.
 *
 * A suggestion is always an offer: it is marked until touched, it never
 * blocks a save, and every decision not to make one is announced. The last
 * part matters more than it looks — a silent early return in a blur handler
 * is indistinguishable from a dead code path to whoever is watching the
 * Network tab.
 */
export function makeTrace(scope: string) {
  return function trace(message: string, detail: Record<string, unknown>) {
    console.debug(`[${scope}] ${message}`, detail)
  }
}
