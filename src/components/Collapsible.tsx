import type { ReactNode } from 'react'

/**
 * Height transition to and from auto, via grid-template-rows — no measuring.
 * Closed content is inert so it leaves the tab order rather than sitting
 * invisible and still focusable. The animation itself is dropped under
 * prefers-reduced-motion, in App.css.
 */
export default function Collapsible({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  return (
    <div className="collapsible" data-open={open}>
      <div className="collapsible-inner" inert={!open}>
        {children}
      </div>
    </div>
  )
}
