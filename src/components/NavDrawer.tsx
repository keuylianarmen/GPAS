import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { t } from '../lib/i18n'

/**
 * The sections list as a drawer, for widths where the tab row does not fit.
 *
 * A native <dialog> for the same reason the modal uses one: showModal() brings
 * Escape, the backdrop and a real focus trap from the platform. The only thing
 * overridden is the position — a dialog centres itself by default, and this
 * one is pinned to the inline-start edge, so it opens from the left in English
 * and the right in Arabic without a direction ever being named.
 */
export default function NavDrawer({
  open,
  onClose,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Identity and sign-out, which the narrow header has no room for. */
  footer: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      className="drawer"
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is the dialog element itself; a click on a child of the
        // panel has that child as its target.
        if (event.target === ref.current) ref.current?.close()
      }}
    >
      <div className="drawer-panel">
        <div className="drawer-head">
          <span className="drawer-title">{t('nav.sections')}</span>
          <button
            type="button"
            className="modal-close"
            onClick={() => ref.current?.close()}
            aria-label={t('action.close')}
          >
            ×
          </button>
        </div>

        <nav className="drawer-nav" aria-label={t('nav.sections')}>
          {children}
        </nav>

        <div className="drawer-foot">{footer}</div>
      </div>
    </dialog>
  )
}
